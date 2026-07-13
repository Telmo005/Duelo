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

// Some pages (notably /admin) fire 8+ independent queries via Promise.all
// in a single request — with a too-small pool, most of them queue behind
// the few that can run at once instead of executing truly concurrently,
// which stacks their latencies serially. Measured directly: the same 8
// admin-dashboard queries took ~3.0s at max:3 vs ~2.4s at max:10, and that
// gap only widens under the higher Vercel↔Supabase network latency
// production sees — enough, compounding with query time, to blow past
// Vercel's serverless function timeout and show as the page just hanging
// forever. 10 was too conservative a walk-back from the session-pooler
// scare above: the transaction pooler is specifically built to multiplex
// many concurrent logical connections cheaply, so there's no longer a
// reason to starve a single request's own internal parallelism.
const client =
  globalForDb.pgClient ?? postgres(connectionString, { prepare: false, max: 10 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgClient = client;
}

export const db = drizzle(client, { schema });
