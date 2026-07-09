# Walking Skeleton — Duelo

**Phase:** 1
**Generated:** 2026-07-09

## Capability Proven End-to-End

> One sentence: the smallest user-visible capability that exercises the full stack.

A new user can register (phone + email + password, confirming 18+), the app writes a `profiles`
row to Supabase Postgres, and after login the deployed app reads that row back and renders the
user's display name and a live (zero) wallet balance on a Duelo-themed dashboard — proving
Next.js → server action → Supabase Auth → Postgres write → Postgres read → themed UI → deployed
dev environment are all wired correctly.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16.2.x (App Router) + React 19 + TypeScript 5, Node 24 LTS | One deployable app for pages, server actions, PaySuite webhook route handlers, and background work. Server Components keep client JS small for the low-end-Android / variable-network target. (STACK.md) |
| Data layer | PostgreSQL 17/18 (Supabase managed) + Drizzle ORM for table defs & typed reads | ACID + row-level locking is the actual double-spend prevention mechanism the whole product rests on. Drizzle stays close to raw SQL so the money path is explicit, not abstracted. (STACK.md) |
| Money mutation mechanism | Postgres PL/pgSQL `SECURITY DEFINER` functions invoked via `supabase-js .rpc()`, every balance change takes `SELECT ... FOR UPDATE` | PostgREST does not support multi-statement client transactions. All balance mutation (credit / hold / release / capture / debit) MUST be a single Postgres function with a row lock. This is not optional. (STACK.md, ARCHITECTURE.md Pattern 1 & 2) |
| Ledger model | Append-only double-entry `wallet_ledger` + cached `wallets` balance row updated in the same tx | Auditability (WALLET-02) and reconstructable balances are hard requirements; never a lone mutable balance column. (ARCHITECTURE.md Anti-Pattern 1) |
| Auth | Supabase Auth email + password (native bcrypt hashing, email-based password reset); phone captured as first-class profile identity; session via `@supabase/ssr` httpOnly cookies | Email+password is the fully-verifiable path with native secure reset and no dependency on unverified Mozambique SMS/OTP deliverability (STACK.md flags SMS as MEDIUM confidence). Phone is stored as the mobile-money identity and accepted as a login identifier (resolved server-side to the account). SMS OTP verification is deferred until deliverability is validated. |
| Payments | PaySuite REST API v1 for deposits (M-Pesa / e-Mola); signed idempotent webhook is the only source of truth for crediting | Only Mozambique mobile-money aggregator with public API docs. Contract is LOW confidence (single-source) → integration is built defensively: env-configurable endpoints/field names, HMAC-SHA256 signature verification, idempotency key stored in the same DB tx as the ledger write, plus a server-side status-poll fallback. (STACK.md, PITFALLS.md Pitfall 2) |
| UI / design system | Tailwind CSS v4 (`@theme` OKLCH) + shadcn/ui (new-york, neutral base, dark-only) + Plus Jakarta Sans + Motion (scoped) | Establishes Duelo's own dark "stadium-at-night" visual identity per 01-UI-SPEC.md, serving DESIGN-01. Motion (JS) used only for the tab indicator and deposit-success checkmark; everything else is CSS/Tailwind to keep the bundle light. |
| Deployment target | Vercel (preview/dev deploy) | Native Next.js host; serverless route handlers receive PaySuite webhooks. Managed Redis (Upstash) for BullMQ reconciliation is deferred until Phase 4 withdrawal / scheduled jobs. |
| Directory layout | Root `app/` (routes), `components/` (ui + feature), `lib/` (supabase, paysuite, wallet, actions), `db/` (Drizzle schema), `supabase/migrations/` (raw SQL: functions + RLS) | Matches the `@/` aliases and `app/globals.css` in 01-UI-SPEC.md's `components.json`. Money-moving PL/pgSQL + RLS live as raw SQL migrations (Drizzle owns table shape + typed reads). |

## Stack Touched in Phase 1

- [x] Project scaffold (Next.js 16, TypeScript, Tailwind v4, shadcn init, Drizzle, Supabase clients, Vitest + Playwright, lint) — Plan 01-01
- [x] Routing — at least one real route (`/`, `/register`, `/login`, `/dashboard`) — Plan 01-01
- [x] Database — at least one real write (`profiles` insert on register) AND one real read (`profiles` select on dashboard) — Plan 01-01; ledger read/write via PL/pgSQL functions — Plan 01-02
- [x] UI — at least one interactive element wired to the API (register form → server action → Supabase → Postgres) — Plan 01-01
- [x] Deployment — running on Vercel dev environment — Plan 01-01

## Out of Scope (Deferred to Later Slices)

> Anything that is *not* in the skeleton. Be explicit — this prevents future phases re-litigating Phase 1's minimalism.

- SMS/OTP phone verification and phone-based password reset (unverified MZ SMS deliverability — STACK.md MEDIUM confidence). Phone is captured but not OTP-verified in v1.
- Document KYC (v1 is 18+ checkbox only — REQUIREMENTS.md Out of Scope).
- Betting / bet matching / escrow locking UI — the atomic `hold`/`release` primitive is built and concurrency-tested in Phase 1 (WALLET-03), but no bet consumes it until Phase 2. Locked balance is therefore always 0 in Phase 1.
- Withdrawal / payout (PAY-04) — Phase 4; reuses the idempotent-webhook pattern established here.
- Scheduled BullMQ/Redis reconciliation job — Phase 1 ships a webhook + on-demand server-side status poll; the scheduled belt-and-suspenders reconciliation lands with withdrawals in Phase 4.
- Settlement, notifications, admin, profile stats, sports data — Phases 3–5.
- Light theme / theme toggle — dark-only in v1 (01-UI-SPEC.md Assumption 1).

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- **Phase 2 — Peer Bet Loop:** consumes `wallet_hold` / `wallet_release` (built + tested here) to lock two-sided escrow; adds bets/fixtures tables, device/IP capture.
- **Phase 3 — Automatic Settlement:** adds `wallet_capture` usage (built here), sports-data poller, settlement job, notifications.
- **Phase 4 — Cash Out & Profile:** reuses the PaySuite client + idempotent-webhook pattern for payouts; adds the scheduled reconciliation job and profile stats.
- **Phase 5 — Admin & Fraud:** read-only back-office over the same auditable ledger; fraud-flag review queue over Phase 2's device/IP data.
