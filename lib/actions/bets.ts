"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getRequestFingerprint } from "@/lib/requestInfo";
import { z } from "zod";

type ActionResult = { error?: string; betId?: string };

const createBetSchema = z.object({
  matchId: z.string().uuid(),
  prediction: z.enum(["home", "draw", "away"]),
  stakeMt: z.coerce.number().positive().max(1_000_000),
});

/** Friendlier messages for the raw exceptions raised inside bet_* functions. */
function friendlyBetError(message: string): string {
  if (message.includes("insufficient available balance")) {
    return "Saldo insuficiente. Deposita antes de criar esta aposta.";
  }
  if (message.includes("match has already started")) {
    return "Este jogo já começou — já não é possível apostar.";
  }
  if (message.includes("no longer open")) {
    return "Esta aposta já foi aceite por outra pessoa.";
  }
  if (message.includes("cannot accept your own bet")) {
    return "Não podes aceitar a tua própria aposta.";
  }
  if (message.includes("only the creator can cancel")) {
    return "Só quem criou a aposta a pode cancelar.";
  }
  return "Não foi possível concluir a operação. Tenta novamente.";
}

export async function createBetAction(input: Record<string, unknown>): Promise<ActionResult> {
  const parsed = createBetSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const stakeCents = Math.round(parsed.data.stakeMt * 100);
  const { ip, deviceId } = await getRequestFingerprint();

  const service = await createServiceClient();
  const { data, error } = await service
    .rpc("bet_create", {
      p_creator_id: user.id,
      p_match_id: parsed.data.matchId,
      p_prediction: parsed.data.prediction,
      p_stake_cents: stakeCents,
      p_creator_ip: ip,
      p_creator_device_id: deviceId,
    })
    .single<{ bet_id: string }>();

  if (error) {
    return { error: friendlyBetError(error.message) };
  }

  revalidatePath("/");
  redirect("/");
  // unreachable, satisfies the ActionResult type for callers that don't redirect
  return { betId: data?.bet_id };
}

export async function acceptBetAction(betId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const { ip, deviceId } = await getRequestFingerprint();
  const service = await createServiceClient();
  const { error } = await service.rpc("bet_accept", {
    p_bet_id: betId,
    p_opponent_id: user.id,
    p_opponent_ip: ip,
    p_opponent_device_id: deviceId,
  });

  if (error) {
    return { error: friendlyBetError(error.message) };
  }

  revalidatePath("/");
  return {};
}

export async function cancelBetAction(betId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const service = await createServiceClient();
  const { error } = await service.rpc("bet_cancel", { p_bet_id: betId, p_requester_id: user.id });

  if (error) {
    return { error: friendlyBetError(error.message) };
  }

  revalidatePath("/");
  return {};
}
