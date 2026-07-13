"use client";

import Link, { useLinkStatus } from "next/link";
import { Handshake, X, Lock, Clock } from "lucide-react";
import { BetActionButton } from "./bet-action-button";
import { DuelSecondaryActions } from "./duel-secondary-actions";
import { TeamBadge } from "@/components/match/team-badge";
import { Spinner } from "@/components/ui/spinner";

export type Duel = {
  id: string;
  /** Short human code (DUE-BET-XXXXXXXX) — used for the share link instead
   *  of the raw id, since a bare UUID in a shared URL reads as a spammy
   *  tracking link. Optional because the logged-out marketing preview
   *  (no real bet backing it) has no reference to give. */
  reference?: string;
  a: { name: string; avatar: string; city: string };
  b: { name: string; avatar: string; city: string } | null;
  match: { home: string; away: string; league: string; time: string; homeLogoUrl?: string | null; awayLogoUrl?: string | null };
  prediction: string;
  predictionCode: string;
  stake: number;
  status: "open" | "live" | "waiting" | "closed";
  createdAgo: string;
  /** Present when this Duel came from a real bet row — needed to tell
   *  the creator's own "waiting" bet apart so we can offer "Cancelar"
   *  instead of "Aceitar". Absent for the logged-out marketing preview. */
  creatorId?: string;
  /** Live-match data (status "live" only). Populated from a live results
   *  feed; until that's wired up it only appears on the marketing preview. */
  score?: { home: number; away: number };
  minute?: string;
};

function InitialAvatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-2 ring-white/10"
      style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function StatusPill({ status }: { status: Duel["status"] }) {
  const map: Record<Duel["status"], { label: string; className: string; dot?: boolean }> = {
    live: { label: "AO VIVO", className: "bg-live-10 text-live", dot: true },
    open: { label: "Aberto", className: "bg-success-10 text-success" },
    waiting: { label: "Aguarda adversário", className: "bg-primary-10 text-primary" },
    closed: { label: "Fechado", className: "bg-locked-10 text-locked" },
  };
  const s = map[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${s.className}`}>
      {s.dot && <span className="inline-block size-1.5 animate-[pulse-dot_1.5s_ease-in-out_infinite] rounded-full bg-live" />}
      {s.label}
    </span>
  );
}

/** The match "stadium" — a top-down football pitch with mowing stripes and
 *  white markings, the two club crests floating on it, and a status overlay:
 *  kickoff time for upcoming games, or live score + minute once it starts. */
function PitchEmbed({ duel }: { duel: Duel }) {
  const isLive = duel.status === "live";
  const hasScore = isLive && !!duel.score;

  return (
    <div className="relative mx-4 mb-3 h-[124px] overflow-hidden rounded-xl border border-success-20">
      {/* Turf */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 130% 100% at 50% 25%, #22935C 0%, #0E3D28 82%)" }}
        aria-hidden
      />
      {/* Mowing stripes */}
      <div
        className="absolute inset-0 opacity-40"
        style={{ background: "repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 34px, transparent 34px 68px)" }}
        aria-hidden
      />
      {/* White markings */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 124" fill="none" preserveAspectRatio="none" aria-hidden>
        <g stroke="rgba(255,255,255,0.30)" strokeWidth="1.3">
          <rect x="6" y="8" width="308" height="108" rx="2" />
          <line x1="160" y1="8" x2="160" y2="116" />
          <circle cx="160" cy="62" r="24" />
          <rect x="6" y="34" width="36" height="56" />
          <rect x="278" y="34" width="36" height="56" />
        </g>
        <circle cx="160" cy="62" r="2" fill="rgba(255,255,255,0.45)" />
      </svg>
      {/* Vignette for depth */}
      <div className="absolute inset-0" style={{ boxShadow: "inset 0 0 44px rgba(0,0,0,0.55)" }} aria-hidden />

      {/* Top overlay: league + clock / live minute */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3 pt-2.5">
        <span className="rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-semibold text-white/90 backdrop-blur-sm">
          {duel.match.league}
        </span>
        {isLive ? (
          <span className="flex items-center gap-1.5 rounded-full bg-live px-2 py-0.5 text-[11px] font-bold text-white">
            <span className="size-1.5 animate-[pulse-dot_1.5s_ease-in-out_infinite] rounded-full bg-white" />
            {duel.minute ?? "AO VIVO"}
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-semibold text-white/90 backdrop-blur-sm">
            <Clock className="size-3" aria-hidden /> {duel.match.time}
          </span>
        )}
      </div>

      {/* Crests + centre (score when live, prediction code otherwise) */}
      <div className="absolute inset-x-0 top-7 bottom-9 flex items-center justify-between px-5">
        <TeamBadge name={duel.match.home} logoUrl={duel.match.homeLogoUrl} size={46} />
        {hasScore ? (
          <p className="text-2xl font-extrabold tabular-nums text-white [text-shadow:0_2px_6px_rgba(0,0,0,0.6)]">
            {duel.score!.home} <span className="text-white/40">-</span> {duel.score!.away}
          </p>
        ) : (
          <span
            className="rounded-md bg-primary px-2 py-1 text-xs font-extrabold text-primary-foreground"
            style={{ boxShadow: "0 2px 10px rgba(0,0,0,0.4)" }}
          >
            {duel.predictionCode}
          </span>
        )}
        <TeamBadge name={duel.match.away} logoUrl={duel.match.awayLogoUrl} size={46} />
      </div>

      {/* Bottom matchup label */}
      <div className="absolute inset-x-0 bottom-0 px-3 pb-2.5">
        <p className="truncate text-[13px] font-bold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.7)]">
          {duel.match.home} <span className="font-normal text-white/60">vs</span> {duel.match.away}
        </p>
      </div>
    </div>
  );
}

/** The two sides of the duel, rendered as clearly STATIC information (flat,
 *  no border-box, no hover) so it can never be confused with the single action
 *  button below. Before, these were button-shaped boxes that did nothing —
 *  the #1 source of "which thing do I press?" confusion. */
function DuelSides({ duel }: { duel: Duel }) {
  return (
    <div className="mx-4 mb-3 grid grid-cols-2 divide-x divide-border overflow-hidden rounded-lg bg-secondary/40">
      <div className="min-w-0 px-3.5 py-2.5">
        <p className="text-[11px] font-medium text-muted-foreground">Previsão</p>
        <p className="truncate text-sm font-bold">{duel.prediction}</p>
      </div>
      <div className="min-w-0 px-3.5 py-2.5">
        <p className="text-[11px] font-medium text-muted-foreground">{duel.b ? "Contra" : "Lado em aberto"}</p>
        <p className="truncate text-sm font-bold">Resultado contrário</p>
      </div>
    </div>
  );
}

/** Dims the card and shows a spinner while its navigation is in flight —
 *  useLinkStatus reads pending state from the nearest enclosing Link. Split
 *  into its own component because that hook only works for a Link's
 *  descendants, and CardBody itself needs to stay a plain function so the
 *  "no real bet" early return below doesn't call a hook conditionally. */
function CardBodyPendingOverlay() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/60 backdrop-blur-[1px]">
      <Spinner className="size-6" />
    </div>
  );
}

/** Wraps the non-interactive top section of the card in a link to the full
 *  duel receipt (/d/[reference]) — only for real bets (see comment at the
 *  call site). Falls back to a plain div for the logged-out marketing
 *  preview, which has nothing real to link to. `press` gives the same
 *  immediate tap feedback every other pressable element in the app has —
 *  without it, a tap that hasn't triggered the (network-dependent, and
 *  often too fast to notice) pending overlay yet looks like it did nothing. */
function CardBody({ duel, children }: { duel: Duel; children: React.ReactNode }) {
  if (!duel.reference) return <>{children}</>;
  return (
    <Link href={`/d/${duel.reference}`} className="press relative block">
      {children}
      <CardBodyPendingOverlay />
    </Link>
  );
}

export function DuelPost({
  duel,
  live = false,
  currentUserId,
}: {
  duel: Duel;
  /** true = real bet with working Aceitar/Cancelar actions; false (default) = logged-out marketing preview linking to /register. */
  live?: boolean;
  currentUserId?: string;
}) {
  const isWaiting = duel.status === "waiting";
  const isOwnBet = live && duel.creatorId === currentUserId;
  const pot = duel.stake * (duel.b ? 2 : 1);
  const firstName = duel.a.name.split(" ")[0];

  return (
    <article
      className={`overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)] transition-shadow ${
        isWaiting
          ? "border-primary-30 shadow-[0_0_24px_rgba(242,194,42,0.12)] hover:shadow-[0_0_32px_rgba(242,194,42,0.22)]"
          : "border-border"
      }`}
    >
      {/* Everything above the action bar links through to the full duel
       *  detail/receipt page — only when it's a real bet (duel.reference is
       *  set), so the logged-out marketing preview (no real row behind it)
       *  never links to a 404. The action bar stays a separate sibling,
       *  never nested inside this Link — an <a> containing a <button>/
       *  another <a> is invalid HTML and breaks click handling. */}
      <CardBody duel={duel}>
        {/* Post header — who created this bet */}
        <div className="flex items-start justify-between gap-3 p-4 pb-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <InitialAvatar name={duel.a.name} color={duel.a.avatar} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold leading-tight">
                {duel.a.name}
                <span className="font-normal text-muted-foreground"> apostou que </span>
                <span className="font-semibold">{duel.prediction}</span>
              </p>
              <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                {duel.a.city} · {duel.createdAgo} · {duel.match.league}
              </p>
            </div>
          </div>
          <StatusPill status={duel.status} />
        </div>

        {/* Match embed — the football pitch with crests + clock/score */}
        <PitchEmbed duel={duel} />

        {/* Opponent line — who's on the other side of this duel */}
        {duel.b && (
          <div className="flex items-center gap-2 px-4 pb-2 text-sm">
            <span className="text-muted-foreground">contra</span>
            <InitialAvatar name={duel.b.name} color={duel.b.avatar} size={22} />
            <span className="font-semibold">{duel.b.name}</span>
          </div>
        )}

        {/* Sides (static info) */}
        <DuelSides duel={duel} />

        {/* Pot — one clear line of information */}
        <div className="flex items-center justify-between px-4 pb-3.5">
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Lock className="size-3.5 text-primary" aria-hidden /> Pote em jogo
          </span>
          <span className="text-base font-extrabold tabular-nums text-primary">MT {pot.toLocaleString("pt")}</span>
        </div>
      </CardBody>

      {/* Action bar — the ONLY pressable element outside CardBody's link */}
      <div className="border-t border-border px-2 py-1.5">
        {isWaiting && isOwnBet ? (
          <BetActionButton
            betId={duel.id}
            mode="cancel"
            icon={<X className="size-4" aria-hidden />}
            label="Cancelar a minha aposta"
            className="press flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold text-destructive transition-colors hover:bg-destructive-10 disabled:opacity-60"
          />
        ) : isWaiting && live ? (
          <BetActionButton
            betId={duel.id}
            mode="accept"
            icon={<Handshake className="size-[18px]" aria-hidden />}
            label={`Aceitar aposta de ${firstName}`}
            className="press flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-extrabold text-primary-foreground shadow-[var(--shadow-elevated)] transition-colors hover:bg-primary-90 disabled:opacity-60"
          />
        ) : isWaiting ? (
          <Link
            href="/register"
            className="press flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-extrabold text-primary-foreground shadow-[var(--shadow-elevated)] transition-colors hover:bg-primary-90"
          >
            <Handshake className="size-[18px]" aria-hidden />
            Aceitar aposta de {firstName}
          </Link>
        ) : (
          <DuelSecondaryActions duelId={duel.id} reference={duel.reference} creatorName={duel.a.name} />
        )}
        {/* Still open? Let anyone looking at it forward the challenge too —
         *  not just the creator. Skipped for the logged-out marketing
         *  preview (no real reference to share) and folded into the single
         *  DuelSecondaryActions above once the duel is no longer waiting. */}
        {isWaiting && duel.reference && (
          <DuelSecondaryActions duelId={duel.id} reference={duel.reference} creatorName={duel.a.name} />
        )}
      </div>
    </article>
  );
}
