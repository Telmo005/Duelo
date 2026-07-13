import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// DATABASE_URL MUST point at Supabase's TRANSACTION pooler (port 6543), not
// the session pooler (5432). The session pooler caps the ENTIRE Supabase
// project at 15 concurrent connections total — fine for one persistent
// server process, but Vercel spins up a separate serverless function
// instance (each running this module, each opening its own pool below) per
// concurrent request. A handful of simultaneous users already exhausts 15,
// and every query in flight at that moment fails with "(EMAXCONNSESSION)
// max clients reached" — an uncaught exception that surfaces to visitors as
// a bare "This page couldn't load" browser error, on whatever page happened
// to be querying at the time. The transaction pooler multiplexes many
// logical clients over far fewer real backend connections instead, which is
// exactly the serverless "many short-lived connections" pattern this app
// has. `prepare: false` below is required for transaction-pooler mode
// (prepared statements aren't supported across pooled connections) — it was
// already set correctly even when the URL itself pointed at the wrong port.
const connectionString = process.env.DATABASE_URL!;

// In dev, Next.js/Turbopack hot-reloads this module on every file change.
// Without caching the client on globalThis, each reload creates a brand new
// postgres() pool without closing the previous one, silently leaking
// connections. Production (one process per cold start, no HMR) is
// unaffected either way, so this only needs to be conditional on NODE_ENV,
// not removed for prod.
const globalForDb = globalThis as unknown as { pgClient?: postgres.Sql };

// max kept low (not the driver's default of 10): each serverless invocation
// gets its OWN pool, so this multiplies by however many run concurrently.
// A handful is enough even for routes that run a few queries in parallel
// (Promise.all) within a single request.
const client =
  globalForDb.pgClient ?? postgres(connectionString, { prepare: false, max: 3 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgClient = client;
}

export const db = drizzle(client, { schema });
