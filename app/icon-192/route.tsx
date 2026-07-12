import { ImageResponse } from "next/og";

/** 192x192 PWA icon (Android home-screen / install prompt). A dedicated
 *  route rather than the icon.tsx file convention because the manifest
 *  needs a fixed, predictable URL to point "src" at. */
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(160deg, #F7D65C 0%, #C99406 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <span style={{ fontSize: 108, fontWeight: 800, color: "#14150B" }}>D</span>
      </div>
    ),
    { width: 192, height: 192 }
  );
}
