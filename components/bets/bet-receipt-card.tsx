"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Copy, Handshake, Lock, Share2, X, Trophy, RotateCcw, Clock } from "lucide-react";
import { TeamBadge } from "@/components/match/team-badge";
import { InfoRow } from "@/components/ui/info-row";
import { ActionButton } from "@/components/ui/action-button";
import { Spinner } from "@/components/ui/spinner";
import { acceptBetAction, cancelBetAction } from "@/lib/actions/bets";
import { formatCentsAsMt } from "@/lib/format";
import type { BetReceipt } from "@/lib/bets";

const STATUS_LABEL: Record<BetReceipt["status"], { label: string; className: string }> = {
  waiting: { label: "À espera de adversário", className: "bg-primary-10 text-primary" },
  matched: { label: "Em jogo", className: "bg-live-10 text-live" },
  settled: { label: "Concluída", className: "bg-success-10 text-success" },
  cancelled: { label: "Cancelada", className: "bg-muted text-muted-foreground" },
  refunded: { label: "Reembolsada", className: "bg-locked-10 text-locked" },
};

export function BetReceiptCard({
  bet,
  viewerId,
  loggedIn,
}: {
  bet: BetReceipt;
  viewerId?: string;
  loggedIn: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  // Cancel gives up locked funds and can't be undone — require a second tap
  // within 3s rather than firing on the first press.
  const [confirmCancel, setConfirmCancel] = useState(false);
  const isCreator = viewerId === bet.creator.id;
  const status = STATUS_LABEL[bet.status];
  // Short reference, not the raw bet id — a bare UUID in a shared URL reads
  // as a spammy tracking link once it lands in someone else's WhatsApp.
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/d/${bet.reference}` : "";

  function handleAccept() {
    startTransition(async () => {
      const result = await acceptBetAction(bet.id);
      if (result?.error) toast.error(result.error);
    });
  }

  function handleCancel() {
    if (!confirmCancel) {
      setConfirmCancel(true);
      setTimeout(() => setConfirmCancel(false), 3000);
      return;
    }
    startTransition(async () => {
      const result = await cancelBetAction(bet.id);
      if (result?.error) toast.error(result.error);
      setConfirmCancel(false);
    });
  }

  async function handleShare() {
    if (navigator.share) {
      // Short, self-contained challenge line — the link's own OG preview
      // already carries the match/crests/stake, so this only needs to say
      // *why* the recipient is getting this link, not repeat what's in it.
      const text = `🔥 ${bet.creator.name} desafiou-te para um duelo na Duelo. Aceita o desafio:`;
      try {
        await navigator.share({ title: "Duelo", text, url: shareUrl });
      } catch {
        // user cancelled the native share sheet — not an error
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copiado!");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

  async function handleCopyReference() {
    try {
      await navigator.clipboard.writeText(bet.reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Não foi possível copiar a referência.");
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
      {/* Header: status + reference */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${status.className}`}>
          {bet.status === "matched" && <span className="inline-block size-1.5 animate-[pulse-dot_1.5s_ease-in-out_infinite] rounded-full bg-live" />}
          {status.label}
        </span>
        <button
          type="button"
          onClick={handleCopyReference}
          className="press flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-bold tabular-nums text-muted-foreground transition-colors hover:bg-accent"
        >
          {copied ? <Check className="size-3 text-success" aria-hidden /> : <Copy className="size-3" aria-hidden />}
          {bet.reference}
        </button>
      </div>

      {/* Match */}
      <div className="flex flex-col items-center gap-3 px-5 py-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{bet.match.league}</p>
        <div className="flex w-full items-center justify-center gap-6">
          <div className="flex flex-col items-center gap-2">
            <TeamBadge name={bet.match.home} logoUrl={bet.match.homeLogoUrl} size={52} />
            <p className="max-w-24 truncate text-sm font-bold">{bet.match.home}</p>
          </div>
          <div className="flex flex-col items-center gap-1">
            {bet.match.resultHome != null && bet.match.resultAway != null ? (
              <p className="text-2xl font-extrabold tabular-nums">
                {bet.match.resultHome}<span className="text-muted-foreground"> - </span>{bet.match.resultAway}
              </p>
            ) : (
              <span className="rounded-md bg-primary px-2 py-1 text-xs font-extrabold text-primary-foreground">
                {bet.predictionCode}
              </span>
            )}
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="size-3" aria-hidden />
              {bet.match.kickoffAt.toLocaleString("pt", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <TeamBadge name={bet.match.away} logoUrl={bet.match.awayLogoUrl} size={52} />
            <p className="max-w-24 truncate text-sm font-bold">{bet.match.away}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          <span className="font-bold text-foreground">{bet.creator.name}</span> apostou em{" "}
          <span className="font-bold text-foreground">{bet.predictionLabel}</span>
          {bet.opponent && (
            <>
              {" "}contra <span className="font-bold text-foreground">{bet.opponent.name}</span>
            </>
          )}
        </p>
      </div>

      {/* Money breakdown / outcome */}
      <div className="border-t border-border px-5">
        {bet.status === "settled" ? (
          <InfoRow
            label={bet.winnerId === viewerId ? "Ganhaste" : bet.winnerId ? "Resultado" : "Pote"}
            emphasis
            value={`${formatCentsAsMt(bet.payoutCents)} MT`}
            valueClassName="text-success"
          />
        ) : (
          <>
            <InfoRow label="Entrada" value={`${formatCentsAsMt(bet.stakeCents)} MT`} />
            <InfoRow label="Pote total" value={`${formatCentsAsMt(bet.potCents)} MT`} />
            <InfoRow label="A receber se ganhar" emphasis value={`${formatCentsAsMt(bet.payoutCents)} MT`} valueClassName="text-success" />
          </>
        )}
      </div>

      {/* Actions */}
      <div className="border-t border-border p-4">
        {bet.status === "waiting" && isCreator ? (
          <div className="flex flex-col gap-2.5">
            <ActionButton type="button" variant="danger" size="md" block loading={isPending} icon={<X className="size-4" aria-hidden />} onClick={handleCancel}>
              {confirmCancel ? "Confirmar cancelamento?" : "Cancelar aposta"}
            </ActionButton>
            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              Se ninguém aceitar até o início do jogo, o valor volta automaticamente para a tua carteira.
            </p>
          </div>
        ) : bet.status === "waiting" && loggedIn ? (
          <ActionButton type="button" size="lg" block loading={isPending} icon={<Handshake className="size-[18px]" aria-hidden />} onClick={handleAccept}>
            Aceitar aposta
          </ActionButton>
        ) : bet.status === "waiting" ? (
          <Link href="/register" className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-extrabold text-primary-foreground shadow-[var(--shadow-elevated)] transition-colors hover:bg-primary-90">
            <Lock className="size-[18px]" aria-hidden />
            Criar conta para aceitar
          </Link>
        ) : bet.status === "refunded" ? (
          <p className="flex items-center justify-center gap-2 rounded-xl bg-locked-10 py-3 text-sm font-semibold text-locked">
            <RotateCcw className="size-4" aria-hidden /> Sem adversário — valor devolvido
          </p>
        ) : bet.status === "settled" ? (
          <p className="flex items-center justify-center gap-2 rounded-xl bg-success-10 py-3 text-sm font-semibold text-success">
            <Trophy className="size-4" aria-hidden /> Aposta liquidada automaticamente
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleShare}
          className="press mt-2.5 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent"
        >
          <Share2 className="size-4" aria-hidden />
          Desafiar
        </button>
      </div>
    </div>
  );
}
