import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS home-screen icon (added via "Adicionar ao ecrã principal"). Apple
 *  applies its own rounding to whatever square we give it, so this is
 *  drawn as a full-bleed square — no rounded corners baked in. */
export default function AppleIcon() {
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
    { ...size }
  );
}
