import { ImageResponse } from "next/og";

export const alt = "Duelo — Apostas P2P entre pessoas reais";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Default share-preview image for any page that doesn't define its own
 *  (e.g. bet pages under /d/[id] override this with the match-specific
 *  card in app/d/[id]/opengraph-image.tsx). */
export default async function OpengraphImage() {
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
        <div
          style={{
            display: "flex",
            width: 120,
            height: 120,
            borderRadius: 32,
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(160deg, #F7D65C, #C99406)",
            color: "#14150B",
            fontSize: 68,
            fontWeight: 800,
            marginBottom: 32,
            boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
          }}
        >
          D
        </div>
        <span style={{ fontSize: 64, fontWeight: 800, color: "#F2C22A", letterSpacing: -1 }}>Duelo</span>
        <span style={{ fontSize: 28, fontWeight: 600, color: "#94989F", marginTop: 16 }}>
          Apostas P2P entre pessoas reais
        </span>
      </div>
    ),
    { ...size }
  );
}
