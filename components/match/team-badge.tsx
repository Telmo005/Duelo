import Image from "next/image";

/** Deterministic "crest" colour per team name — no real badge assets yet,
 *  so a coloured shield with initials stands in for one. */
function teamColor(name: string) {
  const palette = ["#DC2626", "#2563EB", "#059669", "#7C3AED", "#EA580C", "#0891B2"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

const SHIELD_PATH = "polygon(50% 0%, 100% 14%, 100% 62%, 50% 100%, 0% 62%, 0% 14%)";

/** Real crest (from football-data.org, hot-linked) when we have one; otherwise a
 *  shield-shaped placeholder with a metallic gold trim ring, standing in for
 *  crest artwork we don't have (and shouldn't fake as a real club logo).
 *  Shared between the feed (DuelPost) and the bet composer so both render
 *  clubs identically. */
export function TeamBadge({ name, logoUrl, size = 44 }: { name: string; logoUrl?: string | null; size?: number }) {
  if (logoUrl) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-full bg-white/95 p-1.5 ring-2 ring-white/25"
        style={{ width: size + 6, height: size + 6, boxShadow: "0 3px 8px rgba(0,0,0,0.45)" }}
      >
        {/* Routed through Next's image optimizer (media.api-sports.io is
         *  allowlisted in next.config.ts specifically for this) rather than
         *  `unoptimized` — every crest gets converted to WebP/AVIF and
         *  cached at the edge on first request, so every user AFTER the
         *  first to load a given team's badge gets it from a nearby cache
         *  instead of a fresh round-trip to api-sports.io's own origin.
         *  With only ~30-60 distinct teams in play across the covered
         *  leagues, that shared edge cache is what actually matters for load
         *  time on a slow connection — a previous version of this component
         *  bypassed it (reasoning that the source images were "already
         *  small"), which meant literally every visitor's browser re-fetched
         *  every crest straight from the vendor, uncompressed, with no
         *  shared caching benefit at all. */}
        <Image src={logoUrl} alt={name} width={size} height={size} className="size-full object-contain" />
      </div>
    );
  }

  const initials = name
    .split(" ")
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 3)
    .toUpperCase();
  const color = teamColor(name);
  const ringSize = size + 6;
  return (
    <div className="relative shrink-0" style={{ width: ringSize, height: ringSize * 1.1 }} aria-hidden>
      {/* Gold trim ring */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(160deg, #F7D65C, #C99406)",
          clipPath: SHIELD_PATH,
          boxShadow: `0 0 16px ${color}80, 0 3px 8px rgba(0,0,0,0.5)`,
        }}
      />
      {/* Colour face, inset to reveal the ring */}
      <div
        className="absolute flex items-center justify-center font-extrabold text-white"
        style={{
          inset: 3,
          background: `linear-gradient(160deg, ${color}, ${color}CC)`,
          clipPath: SHIELD_PATH,
          fontSize: size * 0.3,
        }}
      >
        <span
          className="absolute inset-0"
          style={{ background: "linear-gradient(115deg, rgba(255,255,255,0.5) 0%, transparent 35%)", clipPath: "inherit" }}
        />
        <span className="relative">{initials}</span>
      </div>
    </div>
  );
}
