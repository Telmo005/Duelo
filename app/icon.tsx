import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Favicon — the "D" monogram, same gold-on-dark mark used on the OG share
 *  image and the manifest icons, so the browser tab, home-screen icon, and
 *  share previews all read as the same brand. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(160deg, #F7D65C, #C99406)",
          borderRadius: 8,
          fontFamily: "sans-serif",
        }}
      >
        <span style={{ fontSize: 22, fontWeight: 800, color: "#14150B" }}>D</span>
      </div>
    ),
    { ...size }
  );
}
