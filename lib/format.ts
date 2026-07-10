/** Formats integer cents as a Metical amount string, e.g. 150000 -> "1.500,00".
 *  Kept dependency-free (no db import) so client components can use it
 *  without pulling the Postgres driver into the browser bundle. */
export function formatCentsAsMt(cents: number): string {
  return (cents / 100).toLocaleString("pt", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
