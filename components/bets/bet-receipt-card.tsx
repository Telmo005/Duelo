"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Copy, Handshake, Lock, Share2, X, Trophy, RotateCcw, Clock, Swords, Goal } from "lucide-react";
import { TeamBadge } from "@/components/match/team-badge";
import { ActionButton } from "@/components/ui/action-button";
import { OptionCard } from "@/components/ui/option-card";
import { SectionLabel } from "@/components/ui/section-label";
import { acceptBetAction, cancelBetAction } from "@/lib/actions/bets";
import { formatCentsAsMt, MOZAMBIQUE_TIMEZONE } from "@/lib/format";
import { marketPredictions, marketLabel, type Market } from "@/lib/betMarkets";
import type { BetReceipt } from "@/lib/bets";

const STATUS_LABEL: Record<BetReceipt["status"], { label: string; className: string }> = {
  waiting: { label: "À espera de adversário", className: "bg-primary-10 text-primary" },
  matched: { label: "Em jogo", className: "bg-live-10 text-live" },
  settled: { label: "Concluída", className: "bg-success-10 text-success" },
  cancelled: { label: "Cancelada", className: "bg-muted text-muted-foreground" },
  refunded: { label: "Reembolsada", className: "bg-locked-10 text-locked" },
};

// no_correct_prediction is deliberately NOT "valor devolvido" like the other
// two — since migration 0036 it's a partial refund (5% of the stake
// retained as a fee), and this page shows the exact amount in the money
// breakdown below. Saying "devolvido" here without qualifying it would read
// as a full refund that never happened.
const REFUND_MESSAGE: Record<NonNullable<BetReceipt["refundReason"]>, string> = {
  no_opponent: "Sem adversário — valor devolvido",
  match_voided: "Jogo adiado/abandonado — valor devolvido",
  no_correct_prediction: "Nenhuma previsão acertou o resultado",
};

type PredictionKey = string;

/** One line of the money breakdown, styled like a till receipt: label, a
 *  dotted leader that stretches to fill whatever space is left, then the
 *  amount — instead of a plain two-column row, so it actually reads as an
 *  itemised total rather than a generic key/value list. */
function ReceiptLine({
  label,
  value,
  emphasis,
  muted,
  valueClassName,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  emphasis?: boolean;
  muted?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className={`flex items-baseline gap-2 py-1.5 ${emphasis ? "text-[15px] font-extrabold" : "text-[13px]"}`}>
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span className="mb-[3px] flex-1 border-b border-dotted border-border" aria-hidden />
      <span className={`shrink-0 tabular-nums ${muted ? "text-muted-foreground" : ""} ${valueClassName ?? ""}`}>{value}</span>
    </div>
  );
}

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
  const isCreator = viewerId === bet.creator.id;
  const status = STATUS_LABEL[bet.status];
  // Real name unless the viewer IS that specific participant — never
  // inferred from "not the creator", which used to mislabel any third-party
  // visitor (or the wrong logged-in user) as "Sua aposta" for someone else's
  // bet.
  function displayName(participantId: string, participantName: string): string {
    return viewerId === participantId ? "Sua aposta" : participantName;
  }
  // Short reference, not the raw bet id — a bare UUID in a shared URL reads
  // as a spammy tracking link once it lands in someone else's WhatsApp.
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/d/${bet.reference}` : "";

  const market = bet.market;

  // The opponent bets on one of the outcomes the creator DIDN'T call — never
  // both, so accepting means picking exactly one. For 1x2 a knockout fixture
  // leaves exactly one outcome once the creator's pick and "draw" are both
  // excluded; total_goals/btts are inherently two-sided, so excluding the
  // creator's pick ALWAYS leaves exactly one — there's never really a
  // choice for those two markets, just a confirmation of the other side.
  function predictionLabel(p: PredictionKey) {
    return marketLabel(market, p, bet.line, bet.match.home, bet.match.away);
  }
  const availableOpponentPredictions = marketPredictions(market, bet.match.isElimination)
    .filter((p) => p !== bet.prediction)
    .map((p) => ({ key: p }));
  const [pickedPrediction, setPickedPrediction] = useState<PredictionKey | null>(null);
  const effectiveOpponentPrediction =
    availableOpponentPredictions.length === 1 ? availableOpponentPredictions[0].key : pickedPrediction;

  function handleAccept() {
    if (!effectiveOpponentPrediction) return;
    startTransition(async () => {
      const result = await acceptBetAction(bet.id, { opponentPrediction: effectiveOpponentPrediction });
      if (result?.error) toast.error(result.error);
    });
  }

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelBetAction(bet.id);
      if (result?.error) toast.error(result.error);
    });
  }

  async function handleShare() {
    if (navigator.share) {
      // Short, self-contained challenge line — the link's own OG preview
      // already carries the match/crests/stake, so this only needs to say
      // *why* the recipient is getting this link, not repeat what's in it.
      const text = `${bet.creator.name} desafiou-te para um duelo na Duelo. Aceita o desafio:`;
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

  // bet.status alone lags reality — it only stops being "waiting" once
  // someone accepts or the bet_auto_refund_expired cron next runs (not
  // instant), so a bet can still read "waiting" for a match that's already
  // kicked off. The server (bet_accept) already rejects this; gating it
  // here too means the button never invites a tap that's just going to
  // fail with an error afterwards.
  const hasKickedOff = bet.match.kickoffAt.getTime() <= Date.now();
  const canAcceptHere = bet.status === "waiting" && !isCreator && loggedIn && !hasKickedOff;
  const isStaleWaiting = bet.status === "waiting" && hasKickedOff;

  // A real invoice gets a stamp once it's resolved — reuse that instead of
  // another status pill. Only stamped once there's a real outcome; "em
  // jogo"/"à espera" stay as the plain pill up top, nothing's final yet.
  // "Ganhaste"/"Perdeste" only make sense for an actual participant — a
  // third party (or a logged-out visitor) following the share link isn't
  // winning or losing anything, so they get the neutral read instead.
  const isParticipant = isCreator || (!!viewerId && viewerId === bet.opponent?.id);
  const stamp =
    bet.status === "settled"
      ? isParticipant
        ? bet.winnerId === viewerId
          ? { text: "Ganhaste", className: "text-success border-success" }
          : { text: "Perdeste", className: "text-destructive border-destructive" }
        : { text: "Concluído", className: "text-success border-success" }
      : bet.status === "refunded"
        ? { text: "Reembolsado", className: "text-locked border-locked" }
        : bet.status === "cancelled"
          ? { text: "Cancelado", className: "text-muted-foreground border-muted-foreground" }
          : null;

  // Ticket stub slots — positioned by which OUTCOME each side predicted
  // (home/draw/away), not by creator/opponent role, so whoever bet on a
  // team always shows up under that team's flag rather than always
  // left-for-creator/right-for-opponent regardless of what they actually
  // picked.
  type Slot = { role: "Criador" | "Adversário"; name: string; label: string };
  const creatorSlot: Slot = { role: "Criador", name: displayName(bet.creator.id, bet.creator.name), label: bet.predictionLabel };

  let opponentSide: PredictionKey | null = null;
  let opponentSlot: Slot | null = null;
  if (bet.opponent && bet.opponentPrediction && bet.opponentPredictionLabel) {
    opponentSide = bet.opponentPrediction;
    opponentSlot = { role: "Adversário", name: displayName(bet.opponent.id, bet.opponent.name), label: bet.opponentPredictionLabel };
  } else if (bet.opponent) {
    // Matched before the three-way market existed (see
    // 0021_opponent_prediction.sql) — the opponent implicitly bet against
    // the creator's exact pick, so there's no specific side to align them
    // under. Rare (only pre-migration bets); falls back to the old generic
    // framing rendered separately below.
    opponentSlot = { role: "Adversário", name: displayName(bet.opponent.id, bet.opponent.name), label: `Contra "${bet.predictionLabel}"` };
  } else if (canAcceptHere && effectiveOpponentPrediction) {
    opponentSide = effectiveOpponentPrediction;
    opponentSlot = { role: "Adversário", name: "Sua aposta", label: predictionLabel(effectiveOpponentPrediction) };
  }
  const legacyOpponentSlot = opponentSlot && !opponentSide ? opponentSlot : null;

  const bySide: Partial<Record<PredictionKey, Slot>> = { [bet.prediction]: creatorSlot };
  if (opponentSlot && opponentSide) bySide[opponentSide] = opponentSlot;
  // Every possible side for this bet's market, in display order — 3 columns
  // for 1x2 (home/draw/away), 2 for total_goals/btts (no draw concept at
  // all, so this is never a 3-column layout for those).
  const orderedSides = marketPredictions(market, bet.match.isElimination);
  const emptySlotText = bet.status === "waiting" ? "por decidir…" : "—";

  function renderSlot(slot: Slot | undefined) {
    if (!slot) return <p className="text-sm text-muted-foreground">{emptySlotText}</p>;
    return (
      <>
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{slot.role}</p>
        <p className="max-w-full truncate text-sm font-bold">{slot.name}</p>
        <p className={`text-sm font-extrabold ${slot.role === "Criador" ? "text-primary" : "text-success"}`}>{slot.label}</p>
      </>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-elevated)]">
      <div className="ticket-edge-top" aria-hidden />

      {stamp && (
        <div
          className={`pointer-events-none absolute right-4 top-28 z-10 -rotate-[14deg] rounded-md border-[3px] px-3 py-1 text-sm font-black uppercase tracking-widest ${stamp.className}`}
          style={{ opacity: 0.92 }}
          aria-hidden
        >
          {stamp.text}
        </div>
      )}

      {/* Shop-style header */}
      <div className="flex flex-col items-center gap-0.5 px-5 pb-3 pt-5 text-center">
        <p className="flex items-center gap-1.5 text-2xl font-black tracking-tight text-primary">
          <Swords className="size-5" aria-hidden /> DUELO
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Recibo de Desafio</p>
      </div>

      <div className="mx-5 border-t border-dashed border-border" />

      <div className="flex items-center justify-between px-5 py-2.5 font-mono text-[11px]">
        <button
          type="button"
          onClick={handleCopyReference}
          className="press flex items-center gap-1.5 font-bold text-foreground"
        >
          {copied ? <Check className="size-3 text-success" aria-hidden /> : <Copy className="size-3 text-muted-foreground" aria-hidden />}
          Nº {bet.reference}
        </button>
        <span className="text-muted-foreground">
          {bet.createdAt.toLocaleString("pt", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: MOZAMBIQUE_TIMEZONE })}
        </span>
      </div>

      <div className="mx-5 border-t border-dashed border-border" />

      <div className="flex justify-center px-5 py-2.5">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${status.className}`}>
          {bet.status === "matched" && <span className="inline-block size-1.5 animate-[pulse-dot_1.5s_ease-in-out_infinite] rounded-full bg-live" />}
          {status.label}
        </span>
      </div>

      {/* Match */}
      <div className="flex flex-col items-center gap-3 px-5 pb-5 pt-1 text-center">
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
              {bet.match.kickoffAt.toLocaleString("pt", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: MOZAMBIQUE_TIMEZONE })}
            </p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <TeamBadge name={bet.match.away} logoUrl={bet.match.awayLogoUrl} size={52} />
            <p className="max-w-24 truncate text-sm font-bold">{bet.match.away}</p>
          </div>
        </div>
      </div>

      <div className="mx-5 border-t border-dashed border-border" />

      {/* Ticket stub — positioned by predicted side (home/draw/away), not by
       *  creator/opponent role, so whoever bet on a team always lines up
       *  under that team's flag above. Gold for the creator's call, green
       *  for the challenger's — same colour "who wins what" already carries
       *  everywhere else in the app (the feed's payout chip is the same
       *  green). Real names always — "Sua aposta" only for the actual viewer, never
       *  inferred for a third party looking at someone else's bet. */}
      {legacyOpponentSlot ? (
        <div className="grid grid-cols-2">
          <div className="flex flex-col items-center gap-1 border-r border-dashed border-border px-3 py-4 text-center">
            {renderSlot(creatorSlot)}
          </div>
          <div className="flex flex-col items-center gap-1 px-3 py-4 text-center">{renderSlot(legacyOpponentSlot)}</div>
        </div>
      ) : (
        <div className={`grid ${orderedSides.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {orderedSides.map((side, i) => (
            <div
              key={side}
              className={`flex flex-col items-center gap-1 px-2 py-4 text-center ${i < orderedSides.length - 1 ? "border-r border-dashed border-border" : ""}`}
            >
              {renderSlot(bySide[side])}
            </div>
          ))}
        </div>
      )}

      {/* Choose your side — only for a prospective acceptor, before they've
       *  committed. Only ever a real choice for 1x2 (and even then, only
       *  when NOT a knockout fixture with 'draw' excluded) — total_goals and
       *  btts are both inherently two-sided, so excluding the creator's pick
       *  always leaves exactly one, shown as a fact rather than a choice. */}
      {canAcceptHere && (
        <>
          <div className="mx-5 border-t border-dashed border-border" />
          <div className="px-5 py-4">
            {availableOpponentPredictions.length > 1 ? (
              <>
                <SectionLabel step={1}>Em que vais apostar</SectionLabel>
                <p className="mb-3 -mt-1 text-xs text-muted-foreground">
                  {bet.creator.name} já escolheu {bet.predictionLabel.toLowerCase()}. Escolhe um dos outros resultados.
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  {availableOpponentPredictions.map((p) => (
                    <OptionCard
                      key={p.key}
                      selected={pickedPrediction === p.key}
                      onSelect={() => setPickedPrediction(p.key)}
                      ariaLabel={predictionLabel(p.key)}
                      className="flex flex-col items-center gap-2 p-3.5 text-center"
                    >
                      {market !== "1x2" ? (
                        <span className="flex size-[30px] items-center justify-center rounded-full bg-secondary text-muted-foreground" aria-hidden>
                          <Goal className="size-4" />
                        </span>
                      ) : p.key === "draw" ? (
                        <span className="flex size-[30px] items-center justify-center rounded-full bg-secondary text-muted-foreground" aria-hidden>
                          <Handshake className="size-4" />
                        </span>
                      ) : (
                        <TeamBadge
                          name={p.key === "home" ? bet.match.home : bet.match.away}
                          logoUrl={p.key === "home" ? bet.match.homeLogoUrl : bet.match.awayLogoUrl}
                          size={30}
                        />
                      )}
                      <span className="text-xs font-semibold leading-tight">{predictionLabel(p.key)}</span>
                    </OptionCard>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-center text-sm">
                {market === "1x2"
                  ? "Jogo de eliminação — só resta um resultado possível."
                  : "Este mercado só tem duas opções."}{" "}
                Vais apostar em{" "}
                <span className="font-bold text-foreground">{predictionLabel(availableOpponentPredictions[0].key)}</span>.
              </p>
            )}
          </div>
        </>
      )}

      <div className="mx-5 border-t border-dashed border-border" />

      {/* Money breakdown — itemised like a till slip */}
      <div className="px-5 py-3 font-mono">
        {bet.status === "settled" ? (
          <ReceiptLine
            label={bet.winnerId === viewerId ? "GANHASTE" : "RESULTADO"}
            emphasis
            value={`MT ${formatCentsAsMt(bet.payoutCents)}`}
            valueClassName="text-success"
          />
        ) : bet.refundReason === "no_correct_prediction" && bet.refundFeeCents != null ? (
          // Partial refund (migration 0036) — shown explicitly, not folded
          // into the generic "devolvido" messaging below, so nobody is
          // surprised their balance went up by less than the full stake.
          <>
            <ReceiptLine label="Entrada" value={`MT ${formatCentsAsMt(bet.stakeCents)}`} />
            <ReceiptLine label="Taxa retida (5%)" value={`-MT ${formatCentsAsMt(bet.refundFeeCents)}`} muted />
            <div className="my-1 border-t border-dashed border-border" />
            <ReceiptLine
              label="DEVOLVIDO"
              emphasis
              value={`MT ${formatCentsAsMt(bet.stakeCents - bet.refundFeeCents)}`}
              valueClassName="text-locked"
            />
          </>
        ) : (
          <>
            <ReceiptLine label="Entrada" value={`MT ${formatCentsAsMt(bet.stakeCents)}`} />
            <ReceiptLine label="Pote total" value={`MT ${formatCentsAsMt(bet.potCents)}`} />
            <ReceiptLine label="Comissão (10%)" value={`-MT ${formatCentsAsMt(bet.commissionCents)}`} muted />
            <div className="my-1 border-t border-dashed border-border" />
            <ReceiptLine label="RECEBES SE GANHAR" emphasis value={`MT ${formatCentsAsMt(bet.payoutCents)}`} valueClassName="text-success" />
          </>
        )}
      </div>

      <div className="mx-5 border-t border-dashed border-border" />

      {/* Actions */}
      <div className="px-5 py-4">
        {bet.status === "waiting" && isCreator ? (
          <div className="flex flex-col gap-2.5">
            <ActionButton type="button" variant="danger" size="md" block loading={isPending} icon={<X className="size-4" aria-hidden />} onClick={handleCancel}>
              Cancelar aposta
            </ActionButton>
            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              Quem aceitar escolhe um resultado diferente do teu. Se ninguém aceitar até o início do jogo, o valor volta automaticamente para a tua carteira.
            </p>
          </div>
        ) : canAcceptHere ? (
          <div className="flex flex-col gap-2.5">
            <ActionButton
              type="button"
              variant="success"
              size="lg"
              block
              loading={isPending}
              disabled={!effectiveOpponentPrediction}
              icon={<Handshake className="size-[18px]" aria-hidden />}
              onClick={handleAccept}
            >
              {`Apostar em ${effectiveOpponentPrediction ? predictionLabel(effectiveOpponentPrediction) : "…"}`}
            </ActionButton>
            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              O valor fica bloqueado até o jogo terminar.
            </p>
          </div>
        ) : isStaleWaiting ? (
          <p className="flex items-center justify-center gap-2 rounded-xl bg-locked-10 py-3 text-sm font-semibold text-locked">
            <Clock className="size-4" aria-hidden /> Este jogo já começou — a aguardar reembolso automático
          </p>
        ) : bet.status === "waiting" ? (
          <Link href="/register" className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-extrabold text-primary-foreground shadow-[var(--shadow-elevated)] transition-colors hover:bg-primary-90">
            <Lock className="size-[18px]" aria-hidden />
            Criar conta para aceitar
          </Link>
        ) : bet.status === "refunded" ? (
          <p className="flex items-center justify-center gap-2 rounded-xl bg-locked-10 py-3 text-sm font-semibold text-locked">
            <RotateCcw className="size-4" aria-hidden /> {bet.refundReason ? REFUND_MESSAGE[bet.refundReason] : "Valor devolvido"}
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
          Partilhar
        </button>
      </div>

      {/* Footer — the "printed" flourish */}
      <div className="px-5 pb-4 pt-1 text-primary/60">
        <div className="barcode-stripes" aria-hidden />
        <p className="mt-1.5 text-center font-mono text-[10px] tracking-[0.3em] text-muted-foreground">{bet.reference}</p>
      </div>

      <div className="ticket-edge-bottom" aria-hidden />
    </div>
  );
}
