import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  boolean,
} from "drizzle-orm/pg-core";

/**
 * profiles — one row per user, created at registration.
 * id references auth.users (managed by Supabase Auth).
 * RLS: owner-only select/update (see supabase/migrations/0000_profiles.sql).
 * Inserts are done server-side using the service-role key, bypassing RLS.
 */
export const profiles = pgTable("profiles", {
  /** Matches auth.users.id — set at registration */
  id: uuid("id").primaryKey(),

  /** Mobile money identity — the primary login identifier (phone + password).
   *  Nullable only for the (currently hidden) Google OAuth path. */
  phone: text("phone").unique(),

  /** Nullable — phone is now the primary identity. Only ever set for the
   *  (currently hidden) Google OAuth path, which supplies an email. */
  email: text("email"),

  /** Display name shown in-app */
  displayName: text("display_name").notNull(),

  /** Timestamp when user confirmed they are 18+ — never null */
  ageConfirmedAt: timestamp("age_confirmed_at", { withTimezone: true }).notNull(),

  /** Row creation timestamp */
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

  /** No RBAC system yet — a single boolean gate for /admin/* (Phase 5 MVP scope). */
  isAdmin: boolean("is_admin").notNull().default(false),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;

/**
 * wallets — one row per user. Cached balance columns only; the actual
 * source of truth is wallet_ledger below. Both columns are updated
 * exclusively inside SECURITY DEFINER Postgres functions (wallet_ensure,
 * wallet_credit, wallet_hold, wallet_release — see
 * supabase/migrations/0001_wallet.sql) which take a row lock
 * (SELECT ... FOR UPDATE) before mutating. Never write these columns
 * directly from application code — that reintroduces the read-then-write
 * race condition the row lock exists to prevent.
 * Amounts are integer cents (MT * 100) to avoid float rounding errors.
 * RLS: owner-only select. No client insert/update/delete.
 */
export const wallets = pgTable("wallets", {
  userId: uuid("user_id").primaryKey(),
  availableCents: bigint("available_cents", { mode: "number" }).notNull().default(0),
  lockedCents: bigint("locked_cents", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Wallet = typeof wallets.$inferSelect;

/**
 * wallet_ledger — append-only double-entry audit trail. One row per
 * balance movement (deposit, hold, release, ...). Never updated or
 * deleted after insert; every row records the delta applied to each
 * bucket plus a post-movement snapshot for auditability.
 * RLS: owner-only select. No client insert/update/delete — rows are
 * written only inside the wallet_* Postgres functions.
 */
export const walletLedger = pgTable("wallet_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  type: text("type").notNull(), // 'deposit' | 'hold' | 'release'
  availableDeltaCents: bigint("available_delta_cents", { mode: "number" }).notNull(),
  lockedDeltaCents: bigint("locked_delta_cents", { mode: "number" }).notNull(),
  availableAfterCents: bigint("available_after_cents", { mode: "number" }).notNull(),
  lockedAfterCents: bigint("locked_after_cents", { mode: "number" }).notNull(),
  reference: text("reference"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type WalletLedgerEntry = typeof walletLedger.$inferSelect;

/**
 * matches — football fixtures available to bet on. Manually seeded for
 * now (see supabase/migrations/0002_bets.sql seed rows); automatic
 * ingestion from a sports-data API (API-Football) is a later phase.
 */
export const matches = pgTable("matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  home: text("home").notNull(),
  away: text("away").notNull(),
  league: text("league").notNull(),
  kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
  /** API-Football fixture ID — null for manually seeded matches, which
   *  the settlement cron skips (nothing to look up). Set this to enable
   *  automatic result fetching for a given fixture. */
  externalId: text("external_id").unique(),
  resultHome: bigint("result_home", { mode: "number" }),
  resultAway: bigint("result_away", { mode: "number" }),
  /** 'scheduled' | 'finished' | 'postponed' | 'abandoned' */
  matchStatus: text("match_status").notNull().default("scheduled"),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

  /** Crest URLs sourced from API-Football (media.api-sports.io) — hot-linked,
   *  never re-hosted, per their media terms. Null falls back to the
   *  coloured-shield placeholder in TeamBadge (manually seeded matches). */
  homeLogoUrl: text("home_logo_url"),
  awayLogoUrl: text("away_logo_url"),
});

export type MatchRow = typeof matches.$inferSelect;

/**
 * bets — one row per P2P bet. Both stakes are held in the wallet's
 * locked bucket (via wallet_hold) from creation/acceptance until
 * cancellation/refund/settlement. All status transitions happen inside
 * SECURITY DEFINER functions (bet_create, bet_accept, bet_cancel — see
 * supabase/migrations/0002_bets.sql) so the wallet hold/release and the
 * bet row update are always atomic — never write `status` directly.
 *
 * status lifecycle: waiting -> matched -> settled
 *                            \-> cancelled | refunded
 */
export const bets = pgTable("bets", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: uuid("match_id").notNull(),
  creatorId: uuid("creator_id").notNull(),
  opponentId: uuid("opponent_id"),
  /** 'home' | 'draw' | 'away' — the creator's prediction (1X2) */
  prediction: text("prediction").notNull(),
  stakeCents: bigint("stake_cents", { mode: "number" }).notNull(),
  status: text("status").notNull().default("waiting"),
  matchedAt: timestamp("matched_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

  /** Captured at bet_create/bet_accept for the same-device/IP self-betting
   *  heuristic (ADMIN-02). Flagging never blocks the bet — flag-and-review
   *  is the correct MVP pattern per the pitfalls research, not auto-block. */
  creatorIp: text("creator_ip"),
  creatorDeviceId: text("creator_device_id"),
  opponentIp: text("opponent_ip"),
  opponentDeviceId: text("opponent_device_id"),
  flaggedReason: text("flagged_reason"),
  flaggedAt: timestamp("flagged_at", { withTimezone: true }),
});

export type Bet = typeof bets.$inferSelect;

/**
 * platform_ledger — one row per settled bet's 10% commission. This is
 * the platform's own revenue trail, separate from wallet_ledger (which
 * only ever records movements to/from a user's own buckets). Written
 * exclusively inside bet_settle_match (supabase/migrations/0003_settlement.sql).
 */
export const platformLedger = pgTable("platform_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  betId: uuid("bet_id").notNull(),
  matchId: uuid("match_id").notNull(),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PlatformLedgerEntry = typeof platformLedger.$inferSelect;
