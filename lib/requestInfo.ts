import { headers, cookies } from "next/headers";

/** IP + device fingerprint pair used by the same-device/IP self-betting heuristic (ADMIN-02). */
export async function getRequestFingerprint() {
  const headerList = await headers();
  const cookieStore = await cookies();

  const forwardedFor = headerList.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() ?? headerList.get("x-real-ip") ?? null;
  const deviceId = cookieStore.get("device_id")?.value ?? null;

  return { ip, deviceId };
}
