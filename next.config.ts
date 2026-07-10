import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Team crests (media.api-sports.io) go through Next's image optimizer —
    // resized once per breakpoint, served as WebP/AVIF, and cached at the
    // edge, instead of every client re-fetching the vendor's full-size PNG.
    remotePatterns: [{ protocol: "https", hostname: "media.api-sports.io" }],
  },
};

export default nextConfig;
