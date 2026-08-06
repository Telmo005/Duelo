import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const alt = "DueloBet — Apostas entre jogadores, não contra a casa";
export const contentType = "image/png";

/**
 * Default share-preview image for any page that doesn't define its own
 * (bet pages under /d/[id] always override this with the match-specific
 * card in app/d/[id]/opengraph-image.tsx — this toggle never touches those).
 *
 * A link's preview image is fixed per URL by whoever controls the page —
 * it's set once here and whatever platform scrapes the link (WhatsApp,
 * Facebook, ...) caches that, so there's no "choose per share" at the
 * viewer's end. This constant is the actual choice: flip it and redeploy
 * to switch which image every share of the site's root link shows.
 */
const USE_CAMPAIGN_IMAGE = true;

// 1200x630 (≈1.91:1) — Facebook/WhatsApp's link-card renderer expects this
// ratio and crops anything else to fit it. The source asset was generated
// square (1254x1254); pasting it into a 1:1 slot got the top ("DUELO BET"
// title) and bottom (footer bar) cropped off and visibly downscaled on
// Facebook. Fixed by letterboxing the square art onto a 1200x630 canvas
// (padded left/right, background color matched to the art's own near-black
// ground) instead of cropping it — see the sharp one-off that produced
// public/og-campaign.png from the original square export.
const CAMPAIGN_IMAGE_PATH = path.join(process.cwd(), "public/og-campaign.png");
const CAMPAIGN_IMAGE_SIZE = { width: 1200, height: 630 };
const GENERATED_IMAGE_SIZE = { width: 1200, height: 630 };

export const size = USE_CAMPAIGN_IMAGE ? CAMPAIGN_IMAGE_SIZE : GENERATED_IMAGE_SIZE;

export default async function OpengraphImage() {
  if (USE_CAMPAIGN_IMAGE) {
    const file = await readFile(CAMPAIGN_IMAGE_PATH);
    return new Response(new Uint8Array(file), {
      headers: { "Content-Type": "image/png" },
    });
  }

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
        <span style={{ fontSize: 64, fontWeight: 800, color: "#F2C22A", letterSpacing: -1 }}>DueloBet</span>
        <span style={{ fontSize: 28, fontWeight: 600, color: "#94989F", marginTop: 16 }}>
          Apostas P2P entre pessoas reais
        </span>
      </div>
    ),
    { ...GENERATED_IMAGE_SIZE }
  );
}
