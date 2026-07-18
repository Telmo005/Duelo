import { ImageResponse } from "next/og";
import { getBetReceipt } from "@/lib/bets";
import { formatCentsAsMt, MOZAMBIQUE_TIMEZONE } from "@/lib/format";

export const alt = "Duelo — aposta P2P";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

const TEAM_COLORS = ["#DC2626", "#2563EB", "#059669", "#7C3AED", "#EA580C", "#0891B2"];
function teamColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TEAM_COLORS[hash % TEAM_COLORS.length];
}

/** Real crest (from API-Football, hot-linked) when the match has one —
 *  set via the team-search picker in /admin/matches — otherwise the same
 *  coloured-initials placeholder the rest of the app falls back to. */
function Crest({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  if (logoUrl) {
    return (
      <div
        style={{
          display: "flex",
          width: 140,
          height: 140,
          borderRadius: 32,
          alignItems: "center",
          justifyContent: "center",
          background: "#fff",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          padding: 16,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- next/image doesn't work inside ImageResponse's satori renderer */}
        <img src={logoUrl} width={108} height={108} style={{ objectFit: "contain" }} alt="" />
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        width: 140,
        height: 140,
        borderRadius: 32,
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(160deg, ${teamColor(name)}, ${teamColor(name)}CC)`,
        color: "#fff",
        fontSize: 48,
        fontWeight: 800,
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      }}
    >
      {initials(name)}
    </div>
  );
}

const KICKOFF_FORMAT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: MOZAMBIQUE_TIMEZONE,
};

export default async function OpengraphImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bet = await getBetReceipt(id);

  const home = bet?.match.home ?? "Duelo";
  const away = bet?.match.away ?? "Aposta P2P";
  const league = bet?.match.league ?? "Moçambique";
  const stakeLabel = bet ? `${formatCentsAsMt(bet.potCents)} MT em jogo` : "Apostas P2P entre pessoas reais";
  const isChallenge = bet?.status === "waiting";
  const kickoffLabel = bet ? bet.match.kickoffAt.toLocaleString("pt", KICKOFF_FORMAT) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
        {/* Pitch turf — same visual language as the feed's match card.
         *  Satori (the renderer behind ImageResponse) doesn't support the
         *  `inset` shorthand — explicit top/left/right/bottom required, or
         *  the layer silently collapses to nothing. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            background: "radial-gradient(ellipse 130% 90% at 50% 15%, #22935C 0%, #0E3D28 78%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            opacity: 0.35,
            background: "repeating-linear-gradient(90deg, rgba(255,255,255,0.07) 0 60px, transparent 60px 120px)",
          }}
        />
        {/* Pitch markings */}
        <svg style={{ position: "absolute", top: 0, left: 0 }} width={1200} height={630} viewBox="0 0 1200 630" fill="none">
          <g stroke="rgba(255,255,255,0.22)" strokeWidth={4}>
            <rect x={40} y={40} width={1120} height={550} rx={8} />
            <line x1={600} y1={40} x2={600} y2={590} />
            <circle cx={600} cy={315} r={90} />
            <rect x={40} y={175} width={140} height={280} />
            <rect x={1020} y={175} width={140} height={280} />
          </g>
          <circle cx={600} cy={315} r={6} fill="rgba(255,255,255,0.32)" />
        </svg>
        {/* Vignette so text stays legible over the turf */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            background: "linear-gradient(180deg, rgba(6,20,13,0.55) 0%, rgba(6,20,13,0.15) 30%, rgba(6,20,13,0.15) 70%, rgba(6,20,13,0.65) 100%)",
          }}
        />

        {/* Foreground content */}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
            <div
              style={{
                display: "flex",
                width: 40,
                height: 40,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(160deg, #F7D65C, #C99406)",
                color: "#14150B",
                fontSize: 24,
                fontWeight: 800,
              }}
            >
              D
            </div>
            <span style={{ fontSize: 26, fontWeight: 800, color: "#F2C22A", letterSpacing: -0.5 }}>Duelo</span>
            <span
              style={{
                display: "flex",
                marginLeft: 4,
                padding: "5px 14px",
                borderRadius: 999,
                background: "rgba(0,0,0,0.4)",
                color: "rgba(255,255,255,0.85)",
                fontSize: 18,
                fontWeight: 600,
              }}
            >
              {league}
            </span>
          </div>

          {isChallenge && (
            <span
              style={{
                display: "flex",
                fontSize: 24,
                fontWeight: 800,
                color: "#F2C22A",
                marginBottom: 18,
                textShadow: "0 2px 8px rgba(0,0,0,0.6)",
              }}
            >
              ⚔️ Desafio em aberto
            </span>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 56 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
              <Crest name={home} logoUrl={bet?.match.homeLogoUrl} />
              <span style={{ fontSize: 28, fontWeight: 700, color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,0.7)" }}>{home}</span>
            </div>
            <span style={{ fontSize: 32, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>vs</span>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
              <Crest name={away} logoUrl={bet?.match.awayLogoUrl} />
              <span style={{ fontSize: 28, fontWeight: 700, color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,0.7)" }}>{away}</span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 36,
              padding: "12px 28px",
              borderRadius: 999,
              background: "rgba(242,194,42,0.18)",
              border: "2px solid rgba(242,194,42,0.5)",
              color: "#F2C22A",
              fontSize: 24,
              fontWeight: 800,
            }}
          >
            {stakeLabel}
          </div>
        </div>

        {/* Kickoff date/time — bottom bar */}
        {kickoffLabel && (
          <div
            style={{
              position: "absolute",
              bottom: 26,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 20px",
              borderRadius: 999,
              background: "rgba(0,0,0,0.45)",
              color: "rgba(255,255,255,0.9)",
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            🕒 {kickoffLabel}
          </div>
        )}
      </div>
    ),
    { ...size }
  );
}
