import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  integer,
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
 * withdrawals — one row per withdrawal request. Created (and the funds
 * locked out of available balance) atomically by the withdrawal_request()
 * Postgres function; flipped to 'completed'/'rejected' exclusively by an
 * admin via withdrawal_complete()/withdrawal_reject() after they've sent
 * the payout by hand on PaySuite's own dashboard — there is no automated
 * payout integration. Never written from the client directly — see
 * supabase/migrations/0017_withdrawals.sql.
 */
export const withdrawals = pgTable("withdrawals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  method: text("method").notNull(), // 'mpesa' | 'emola'
  /** Destination for the payout — not necessarily the requester's own
   *  registered phone (see migration comment for the fraud-review angle). */
  phone: text("phone").notNull(),
  recipientName: text("recipient_name").notNull(),
  status: text("status").notNull().default("pending"), // 'pending' | 'completed' | 'rejected'
  reference: text("reference").notNull(),
  adminNote: text("admin_note"),
  processedBy: uuid("processed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("withdrawals_reference_uq").on(t.reference),
  index("withdrawals_user_id_created_at_idx").on(t.userId, t.createdAt),
  index("withdrawals_status_created_at_idx").on(t.status, t.createdAt),
]);

export type Withdrawal = typeof withdrawals.$inferSelect;

/**
 * notifications — one row per event a user or admin needs to know about
 * (bet accepted/won/lost/refunded, deposit succeeded/failed, withdrawal
 * completed/rejected, or — for admins — a new withdrawal request). Written
 * exclusively by the notify() Postgres function, called from inside the
 * same SECURITY DEFINER functions that perform each event (or directly
 * from the PayGate webhook for deposit outcomes) — see
 * supabase/migrations/0018_notifications.sql. Never written from the
 * client; read-only for its owner via RLS.
 */
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  /** Where tapping the notification takes the user, e.g. /d/DUE-BET-xxx. */
  link: text("link"),
  /** The underlying thing's own reference (DUE-DEP-xxx, DUE-BET-xxx, ...),
   *  when there is one — lets a later event about the same thing (e.g. a
   *  deposit that first reported 'failed', then a late 'payment.success'
   *  arrived) find and remove the now-superseded notification instead of
   *  leaving two contradictory ones sitting side by side. */
  reference: text("reference"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("notifications_user_id_created_at_idx").on(t.userId, t.createdAt),
]);

export type Notification = typeof notifications.$inferSelect;

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
  /** API-Football's numeric league ID — null for manually seeded matches
   *  (no vendor league to key off of). `league` is a display NAME, and
   *  different countries' leagues can share the exact same name (England's
   *  "Premier League" and Kazakhstan's, for instance) — grouping/matching
   *  by name alone silently merges them into one section. This is the real
   *  identity; `league`/`country` are what a human reads. */
  leagueId: integer("league_id"),
  /** API-Football's country name for the league (e.g. "England",
   *  "Kazakhstan") — null for manually seeded matches. Only used to
   *  disambiguate a `league` name that collides with a different
   *  leagueId's (see lib/leagueTiers.ts groupByLeague) — never shown on
   *  its own. */
  country: text("country"),
  kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
  /** API-Football fixture ID — null for manually seeded matches. Lifecycle/
   *  settlement no longer depends on this (see 0028_match_live_lifecycle.sql
   *  — purely time-based now); it only gates the optional live-score badge
   *  (update-live-scores cron). */
  externalId: text("external_id").unique(),
  resultHome: bigint("result_home", { mode: "number" }),
  resultAway: bigint("result_away", { mode: "number" }),
  /** 'scheduled' | 'live' | 'needs_review' | 'finished' | 'postponed' |
   *  'abandoned' | 'closed' — see 0028_match_live_lifecycle.sql for the full
   *  state machine (match_advance_lifecycle drives scheduled→live→
   *  closed/needs_review purely off kickoff_at; needs_review/live/scheduled
   *  →finished/postponed/abandoned is always a manual admin action). */
  matchStatus: text("match_status").notNull().default("scheduled"),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

  /** Crest URLs sourced from API-Football (media.api-sports.io) — hot-linked,
   *  never re-hosted, per their media terms. Null falls back to the
   *  coloured-shield placeholder in TeamBadge (manually seeded matches). */
  homeLogoUrl: text("home_logo_url"),
  awayLogoUrl: text("away_logo_url"),

  /** Knockout fixture (cup final, CL knockout round, etc.) — extra time and
   *  penalties always produce a winner, so 'draw' is never a valid
   *  prediction or a valid settlement result for one. Enforced both in
   *  bet_create and bet_settle_match (see 0019_elimination_matches.sql). */
  isElimination: boolean("is_elimination").notNull().default(false),

  /** In-play score + minute (migration 0007) — display-only, deliberately
   *  separate from result_home/result_away so tracking a live score can
   *  never accidentally trigger or affect settlement (bet_settle_match
   *  only reads result_home/result_away, never these). Written by the
   *  update-live-scores cron for API-linked matches, or manually by an
   *  admin (updateLiveScoreAction) for matches with no automated feed. */
  liveHome: integer("live_home"),
  liveAway: integer("live_away"),
  liveMinute: integer("live_minute"),
  liveUpdatedAt: timestamp("live_updated_at", { withTimezone: true }),
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
  /** 'home' | 'draw' | 'away' — the opponent's own prediction, picked at
   *  accept time from whichever outcomes the creator didn't call. Null
   *  until matched. Always differs from `prediction` (enforced in
   *  bet_accept and by a DB check constraint) — if the actual result
   *  matches neither, bet_settle_match refunds both sides. */
  opponentPrediction: text("opponent_prediction"),
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
  /** 'login' | 'register' — kept in the same table (both are phone/IP-keyed
   *  auth events) but counted separately, so a burst of one never locks out
   *  the other. */
  kind: text("kind").notNull().default("login"),
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

/**
 * error_log — append-only trail of server-side failures (webhook credit
 * failures, cron crashes, rate-limit DB hiccups, client render errors).
 * Before this, every error path only reached `console.error`, which on
 * Vercel means ephemeral function logs nobody is watching — an error at
 * 3am (a stuck deposit, a cron that silently failed) left zero durable
 * trace. Written via lib/errorLog.ts, read by /admin/errors.
 */
export const errorLog = pgTable("error_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Where it came from — e.g. "webhook_paygate", "cron_settle_matches",
   *  "client_error_boundary" — lets /admin/errors filter/scan by origin. */
  source: text("source").notNull(),
  message: text("message").notNull(),
  /** JSON-stringified extra context (stack trace, relevant IDs) — kept as
   *  plain text rather than jsonb since this is read by a human, not
   *  queried by field. */
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ErrorLogEntry = typeof errorLog.$inferSelect;
