import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server be reached from a phone on the same Wi-Fi (via the
  // machine's LAN IP) for real-device testing. Without this, Next.js blocks
  // cross-origin requests to /_next/* in dev mode — the page loads but React
  // never hydrates, so every button/click silently does nothing.
  allowedDevOrigins: ["10.153.59.164"],
  images: {
    // Team crests go through Next's image optimizer — resized once per
    // breakpoint, served as WebP/AVIF, and cached at the edge, instead of
    // every client re-fetching the vendor's full-size PNG from its own,
    // measurably slow origin (confirmed directly: crests.football-data.org
    // takes ~1-1.7s time-to-first-byte per crest — not a proper CDN). With
    // only ~30-60 distinct teams across the covered leagues, that shared
    // edge cache is what actually matters for load time on a slow
    // connection: only the FIRST request for a given team, from anyone,
    // ever pays the vendor's slow round-trip — every subsequent viewer gets
    // it from Vercel's nearby edge cache.
    //
    // media.api-sports.io (the pre-migration vendor) stays allowlisted too
    // — matches.home_logo_url/away_logo_url on rows imported before the
    // football-data.org migration still point there, and an unlisted
    // hostname isn't a broken image, it's next/image throwing and taking
    // down the whole page render (confirmed directly: removing this domain
    // while old rows still reference it crashed with "Invalid src prop...
    // hostname is not configured"). Safe to drop only once every row's
    // logo URL has been confirmed migrated off that domain.
    remotePatterns: [
      { protocol: "https", hostname: "crests.football-data.org" },
      { protocol: "https", hostname: "media.api-sports.io" },
    ],
  },
};

export default nextConfig;
