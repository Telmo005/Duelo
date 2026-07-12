import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  boolean,
  uniqueIndex,
  index,
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
 * deposits — one row per deposit attempt via the PayGate gateway
 * (mpesa/emola, PaySuite behind the scenes). Created 'pending' when the
 * charge is created; flipped to 'success'/'failed' exclusively by the
 * PayGate webhook (app/api/webhooks/paygate/route.ts), which then calls
 * wallet_credit() to move the money into the user's wallet. Never
 * written from the client — see supabase/migrations/0012_deposits.sql.
 */
export const deposits = pgTable("deposits", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  method: text("method").notNull(), // 'mpesa' | 'emola'
  phone: text("phone").notNull(),
  status: text("status").notNull().default("pending"), // 'pending' | 'success' | 'failed'
  reference: text("reference").notNull(),
  gatewayPaymentId: text("gateway_payment_id"),
  checkoutUrl: text("checkout_url"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("deposits_reference_uq").on(t.reference),
  uniqueIndex("deposits_gateway_payment_id_uq").on(t.gatewayPaymentId),
  index("deposits_user_id_created_at_idx").on(t.userId, t.createdAt),
]);

export type Deposit = typeof deposits.$inferSelect;

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
  /** Short human-readable code (DUE-BET-XXXXXXXX) shown on the receipt and
   *  shareable bet page; also the lookup key for support/audit. */
  reference: text("reference").notNull(),
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

/**
 * auth_attempts — sliding-window login attempt log backing the signIn
 * rate limiter (lib/rateLimit.ts). The synthetic-email identity is
 * derivable from any known phone number, so this table is the actual
 * brute-force defense. Never exposed to RLS/PostgREST — internal only.
 */
export const authAttempts = pgTable("auth_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: text("phone").notNull(),
  ip: text("ip"),
  success: boolean("success").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AuthAttempt = typeof authAttempts.$inferSelect;

/**
 * admin_audit_log — append-only trail of admin actions (password resets,
 * manual settlement/void). Written exclusively by lib/adminAudit.ts.
 * Satisfies the "auditoria e rastreabilidade completa" requirement for
 * anything an admin does on another user's behalf.
 */
export const adminAuditLog = pgTable("admin_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminId: uuid("admin_id").notNull(),
  action: text("action").notNull(),
  targetUserId: uuid("target_user_id"),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AdminAuditLogEntry = typeof adminAuditLog.$inferSelect;
