import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Use session pooler URL (port 5432) for Drizzle — not transaction pooler
const connectionString = process.env.DATABASE_URL!;

// In dev, Next.js/Turbopack hot-reloads this module on every file change.
// Without caching the client on globalThis, each reload creates a brand new
// postgres() pool without closing the previous one, silently leaking
// connections until the Supabase pooler's session-mode cap (15) is hit and
// every query starts failing with "max clients reached". Production
// (one process per cold start, no HMR) is unaffected either way, so this
// only needs to be conditional on NODE_ENV, not removed for prod.
const globalForDb = globalThis as unknown as { pgClient?: postgres.Sql };

// Disable prefetch as it is not supported for transaction pooler mode
const client =
  globalForDb.pgClient ?? postgres(connectionString, { prepare: false, max: 10 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgClient = client;
}

export const db = drizzle(client, { schema });
