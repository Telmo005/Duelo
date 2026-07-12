import { ImageResponse } from "next/og";

/** 512x512 PWA icon (Android splash screen). Same dedicated-route reasoning
 *  as icon-192 — the manifest needs a fixed URL. The mark sits inside a
 *  padded safe zone so Android's maskable-icon cropping (circle/squircle)
 *  never clips the "D". */
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
        <span style={{ fontSize: 288, fontWeight: 800, color: "#14150B" }}>D</span>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
