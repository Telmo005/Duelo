/** Formats integer cents as a Metical amount string, e.g. 150000 -> "1.500,00".
 *  Kept dependency-free (no db import) so client components can use it
 *  without pulling the Postgres driver into the browser bundle. */
export function formatCentsAsMt(cents: number): string {
  return (cents / 100).toLocaleString("pt", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Mozambique observes no daylight saving and is always UTC+2 — a fixed
 *  offset is enough, no timezone database/library needed. Every kickoff/
 *  ledger/audit timestamp shown to a user should render in this zone
 *  explicitly (pass as `timeZone` to `toLocaleString`) rather than relying
 *  on the ambient runtime's timezone: Vercel's server functions default to
 *  UTC, and a viewer's own device could be set to anything — but the whole
 *  product is Mozambique-only, so the time that matters is always Maputo's,
 *  never "whichever timezone happens to be rendering this". */
export const MOZAMBIQUE_TIMEZONE = "Africa/Maputo";

/** Parses a native `<input type="datetime-local">` value
 *  ("YYYY-MM-DDTHH:mm", carries no timezone info) as Mozambique local time
 *  explicitly — the fixed +02:00 offset makes this correct regardless of
 *  what timezone the code parsing it happens to run in (the admin's browser
 *  for the live preview, Vercel's UTC server for the actual save). Without
 *  this, the same string parsed via a bare `new Date(value)` on the server
 *  gets interpreted as UTC (Vercel's runtime default), silently storing
 *  every manually-entered kickoff 2 hours later than the admin actually
 *  typed. */
export function parseMozambiqueDateTimeLocal(value: string): Date {
  return new Date(`${value}:00+02:00`);
}
