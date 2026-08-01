import { redirect } from "next/navigation";
import { referralCodeExists } from "@/lib/referral";

/**
 * Public referral landing — /r/K7M2QRX. No auth, same shape as /d/[id]
 * (app/d/[id]/page.tsx): a link meant to be opened by someone who doesn't
 * have an account yet. Unlike /d/[id] there's nothing to actually show
 * here — the whole point is the code — so it just forwards straight into
 * registration with ?ref= prefilled. An unknown/stale code never 404s;
 * it silently drops through to a plain /register instead, since the link
 * itself is what a real person is trying to use to sign up.
 */
export default async function ReferralLandingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const exists = await referralCodeExists(code);
  redirect(exists ? `/register?ref=${encodeURIComponent(code.toUpperCase())}` : "/register");
}
