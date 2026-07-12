import { ImageResponse } from "next/og";
import { getBetReceipt } from "@/lib/bets";
import { formatCentsAsMt } from "@/lib/format";

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

function Crest({ name }: { name: string }) {
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
        boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
      }}
    >
      {initials(name)}
    </div>
  );
}

export default async function OpengraphImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bet = await getBetReceipt(id);

  const home = bet?.match.home ?? "Duelo";
  const away = bet?.match.away ?? "Aposta P2P";
  const league = bet?.match.league ?? "Moçambique";
  const stakeLabel = bet ? `${formatCentsAsMt(bet.potCents)} MT em jogo` : "Apostas P2P entre pessoas reais";

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
          background: "linear-gradient(160deg, #14151D 0%, #1B1C26 60%, #14151D 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 36 }}>
          <div
            style={{
              display: "flex",
              width: 44,
              height: 44,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(160deg, #F7D65C, #C99406)",
              color: "#14150B",
              fontSize: 26,
              fontWeight: 800,
            }}
          >
            D
          </div>
          <span style={{ fontSize: 30, fontWeight: 800, color: "#F2C22A", letterSpacing: -0.5 }}>Duelo</span>
        </div>

        <span style={{ fontSize: 22, fontWeight: 600, color: "#94989F", marginBottom: 28 }}>{league}</span>

        <div style={{ display: "flex", alignItems: "center", gap: 56 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <Crest name={home} />
            <span style={{ fontSize: 30, fontWeight: 700, color: "#E9EAF0" }}>{home}</span>
          </div>
          <span style={{ fontSize: 34, fontWeight: 700, color: "#94989F" }}>vs</span>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <Crest name={away} />
            <span style={{ fontSize: 30, fontWeight: 700, color: "#E9EAF0" }}>{away}</span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 44,
            padding: "14px 32px",
            borderRadius: 999,
            background: "rgba(242,194,42,0.14)",
            border: "2px solid rgba(242,194,42,0.4)",
            color: "#F2C22A",
            fontSize: 28,
            fontWeight: 800,
          }}
        >
          {stakeLabel}
        </div>
      </div>
    ),
    { ...size }
  );
}
