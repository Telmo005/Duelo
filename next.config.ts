import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server be reached from a phone on the same Wi-Fi (via the
  // machine's LAN IP) for real-device testing. Without this, Next.js blocks
  // cross-origin requests to /_next/* in dev mode — the page loads but React
  // never hydrates, so every button/click silently does nothing.
  allowedDevOrigins: ["10.156.227.164"],
  images: {
    // Team crests (media.api-sports.io) go through Next's image optimizer —
    // resized once per breakpoint, served as WebP/AVIF, and cached at the
    // edge, instead of every client re-fetching the vendor's full-size PNG.
    remotePatterns: [{ protocol: "https", hostname: "media.api-sports.io" }],
  },
};

export default nextConfig;
