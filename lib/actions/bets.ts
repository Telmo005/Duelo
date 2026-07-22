"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getRequestFingerprint } from "@/lib/requestInfo";
import { broadcastFeedEvent } from "@/lib/realtime";
import { db } from "@/db";
import { bets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

type ActionResult = { error?: string; betId?: string };

// Discriminated on `market` so each variant only accepts the fields that
// actually make sense for it — a total_goals bet without a line (or a 1x2
// bet WITH one) fails validation here, before ever reaching bet_create's
// own (redundant, defense-in-depth) checks. See lib/betMarkets.ts for the
// single source of truth these values come from.
const stakeSchema = z.coerce.number().positive().max(1_000_000);
const createBetSchema = z.discriminatedUnion("market", [
  z.object({ market: z.literal("1x2"), matchId: z.string().uuid(), prediction: z.enum(["home", "draw", "away"]), stakeMt: stakeSchema }),
  z.object({
    market: z.literal("total_goals"),
    matchId: z.string().uuid(),
    prediction: z.enum(["over", "under"]),
    line: z.union([z.literal(1.5), z.literal(2.5), z.literal(3.5)]),
    stakeMt: stakeSchema,
  }),
  z.object({ market: z.literal("btts"), matchId: z.string().uuid(), prediction: z.enum(["yes", "no"]), stakeMt: stakeSchema }),
]);

/** Friendlier messages for the raw exceptions raised inside bet_* functions. */
function friendlyBetError(message: string): string {
  if (message.includes("insufficient available balance")) {
    return "Saldo insuficiente. Deposita antes de criar esta aposta.";
  }
  if (message.includes("cannot accept")) {
    return "Este jogo já começou — já não é possível aceitar esta aposta.";
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
  if (message.includes("must differ from the creator")) {
    return "Escolhe um resultado diferente do que o criador previu.";
  }
  if (message.includes("cannot be predicted as a draw")) {
    return "Este jogo é de eliminação — não há opção de empate.";
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
      p_market: parsed.data.market,
      p_line: parsed.data.market === "total_goals" ? parsed.data.line : null,
    })
    .single<{ bet_id: string; reference: string }>();

  if (error) {
    return { error: friendlyBetError(error.message) };
  }

  await broadcastFeedEvent({ type: "bet_created", matchId: parsed.data.matchId });

  revalidatePath("/");
  // Land on the shareable receipt page (reference, match, share button) —
  // more useful right after creating a bet than dropping back into the feed.
  // Uses the short reference, not the raw bet id — a bare UUID in the URL
  // reads as a spammy tracking link once shared.
  redirect(`/d/${data!.reference}`);
}

// Not market-specific here — the client only ever sends a prediction valid
// for the bet's own market (bet-receipt-card.tsx derives it from the same
// lib/betMarkets.ts used everywhere else), and bet_accept re-validates it
// against v_bet.market server-side regardless, so this is just "one of the
// values any market could use", not a redundant per-market check.
const acceptBetSchema = z.object({
  opponentPrediction: z.enum(["home", "draw", "away", "over", "under", "yes", "no"]),
});

export async function acceptBetAction(betId: string, input: Record<string, unknown>): Promise<ActionResult> {
  const parsed = acceptBetSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Escolhe o resultado em que estás a apostar." };
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const { ip, deviceId } = await getRequestFingerprint();
  const service = await createServiceClient();
  const { error } = await service.rpc("bet_accept", {
    p_bet_id: betId,
    p_opponent_id: user.id,
    p_opponent_prediction: parsed.data.opponentPrediction,
    p_opponent_ip: ip,
    p_opponent_device_id: deviceId,
  });

  if (error) {
    return { error: friendlyBetError(error.message) };
  }

  const [acceptedBet] = await db.select({ creatorId: bets.creatorId, matchId: bets.matchId }).from(bets).where(eq(bets.id, betId)).limit(1);
  if (acceptedBet) {
    await broadcastFeedEvent({ type: "bet_accepted", betId, matchId: acceptedBet.matchId, creatorId: acceptedBet.creatorId });
  }

  revalidatePath("/");
  revalidatePath(`/d/${betId}`);
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

  const [cancelledBet] = await db.select({ matchId: bets.matchId }).from(bets).where(eq(bets.id, betId)).limit(1);
  if (cancelledBet) {
    await broadcastFeedEvent({ type: "bet_cancelled", betId, matchId: cancelledBet.matchId });
  }

  revalidatePath("/");
  revalidatePath(`/d/${betId}`);
  return {};
}
