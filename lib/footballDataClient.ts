const BASE_URL = "https://api.football-data.org/v4";

export type FootballDataResponse<T = unknown> = {
  body?: T;
  error?: string;
};

/**
 * The single chokepoint every football-data.org HTTP call goes through.
 * Replaces lib/apiFootballClient.ts (API-Football) — this vendor's rate
 * limit is structurally simpler and doesn't need the daily-quota tracking
 * that one required: 10 requests/minute on a rolling window, no daily cap
 * at all (x-requestcounter-reset / x-requests-available-minute headers, if
 * ever needed for diagnostics — not persisted anywhere, because our actual
 * call volume never comes close: the automatic sync fires at most once a
 * minute, and admin actions are occasional).
 */
export async function footballDataFetch<T = unknown>(path: string): Promise<FootballDataResponse<T>> {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) return { error: "FOOTBALL_DATA_TOKEN não está configurada" };

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { "X-Auth-Token": token },
      cache: "no-store",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.message ? `: ${body.message}` : "";
    } catch {
      // ignore — not every error response is JSON
    }
    return { error: `Pedido falhou (HTTP ${res.status})${detail}` };
  }

  try {
    return { body: (await res.json()) as T };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
