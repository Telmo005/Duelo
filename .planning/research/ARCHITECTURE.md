# Architecture Research

**Domain:** P2P sports betting platform (wallet/escrow + mobile-money payments + automated settlement)
**Researched:** 2026-07-09
**Confidence:** MEDIUM (patterns are well-established fintech/ledger practice, cross-checked across multiple independent sources; Mozambique-specific PaySuite details and P2P-betting-specific settlement rules are LOW confidence — verify against live PaySuite docs and write down your own house rules before build)

## Standard Architecture

### System Overview

```
┌───────────────────────────────────────────────────────────────────────┐
│                              CLIENT (Web/Mobile)                       │
├───────────────────────────────────────────────────────────────────────┤
│  Auth UI  │  Wallet UI  │  Bet Feed/Create/Accept  │  Profile  │ Admin │
└──────┬─────────┬──────────────┬─────────────────────┬───────────┬────┘
       │         │              │                     │           │
┌──────┴─────────┴──────────────┴─────────────────────┴───────────┴────┐
│                          API LAYER (application services)              │
│ ┌───────────┐ ┌───────────────┐ ┌─────────────────┐ ┌──────────────┐ │
│ │   Auth    │ │  Wallet /     │ │  Bet Matching    │ │  Notification│ │
│ │  Service  │ │  Ledger       │ │  Engine          │ │  Service     │ │
│ │           │ │  Service      │ │  (create/accept/ │ │              │ │
│ │           │ │  (source of   │ │   cancel bets)   │ │              │ │
│ │           │ │   truth for   │ │                  │ │              │ │
│ │           │ │   money)      │ │                  │ │              │ │
│ └───────────┘ └───────┬───────┘ └────────┬─────────┘ └──────────────┘ │
├───────────────────────┼──────────────────┼─────────────────────────────┤
│           BACKGROUND WORKERS / JOBS (async, queue-driven)               │
│ ┌───────────────────┐ ┌────────────────────┐ ┌─────────────────────┐  │
│ │ Payment Webhook    │ │ Settlement Engine   │ │ Expiry/Cancellation │  │
│ │ Handler (PaySuite  │ │ (results polling +  │ │ Sweeper (unmatched  │  │
│ │ deposit/withdrawal │ │  payout trigger)    │ │  bets past kickoff) │  │
│ │ callbacks)         │ │                     │ │                     │  │
│ └─────────┬──────────┘ └──────────┬──────────┘ └──────────┬──────────┘  │
├───────────┼───────────────────────┼────────────────────────┼────────────┤
│           │            PERSISTENCE LAYER                    │            │
│  ┌────────┴────────┐  ┌───────────┴──────────┐  ┌──────────┴────────┐  │
│  │  Ledger tables   │  │  Bets / Matches /    │  │  Audit log /       │  │
│  │  (append-only)   │  │  Fixtures tables     │  │  admin action log  │  │
│  └──────────────────┘  └──────────────────────┘  └────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
             ↑                          ↑
   ┌─────────┴─────────┐     ┌──────────┴───────────┐
   │  PaySuite Gateway  │     │  Sports Data API     │
   │  (M-Pesa / e-Mola) │     │  (fixtures + results) │
   └────────────────────┘     └───────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Auth Service | Registration, login, session/JWT issuance, 18+ confirmation flag, password reset | Standard auth (email/phone + password or OTP), sessions in JWT or server-side session table; owns `users` table identity fields only |
| Wallet/Ledger Service | The ONLY component allowed to mutate money. Exposes `credit`, `debit`, `hold` (lock), `release`, `capture` operations, each atomic and idempotent. Computes available/locked/total balance | Double-entry ledger table (append-only) + a derived/cached balance view; every mutation wrapped in one DB transaction with row locks |
| Bet Matching Engine | Bet lifecycle state machine: create (open) → accept (matched) → settle/cancel. Calls Wallet Service to place/release holds. Never touches money directly | Application service calling Wallet Service's hold/capture/release API; owns `bets` table |
| Settlement Engine | Polls/consumes the sports-data API for fixture status and results, resolves 1X2 outcome, triggers payout (capture) or refund (release) via Wallet Service | Scheduled job/worker (cron or queue-driven), idempotent per fixture-result event |
| Payment Gateway Integration | Deposit: creates a PaySuite payment request, waits for webhook confirmation, credits wallet. Withdrawal: creates a PaySuite payout request, debits wallet on confirmation (or reverses hold on failure) | Webhook receiver endpoint + outbound API client to PaySuite; must verify HMAC signature, dedupe by `request_id`, and process inside a DB transaction |
| Notification Service | Sends push/SMS/in-app notifications on bet accepted, cancelled/refunded, settled | Fire-and-forget consumer of domain events (bet.accepted, bet.settled, wallet.deposit.confirmed, etc.) |
| Admin Panel | Read/manage users, bets, wallets, deposits/withdrawals, revenue, audit log, fraud flags, manual overrides (void a stuck bet, ban a user) | Separate route/permission tier over the same services — admin actions themselves are logged as ledger/audit entries, never direct DB edits |

## Recommended Project Structure

```
src/
├── modules/
│   ├── auth/                # registration, login, session, age-confirmation
│   │   ├── auth.service.ts
│   │   └── auth.routes.ts
│   ├── wallet/               # THE money module — single writer to ledger
│   │   ├── ledger.repository.ts   # append-only entries, SELECT FOR UPDATE
│   │   ├── wallet.service.ts      # hold(), release(), capture(), credit(), debit()
│   │   └── wallet.routes.ts       # balance, transaction history endpoints
│   ├── betting/               # bet lifecycle, matching
│   │   ├── bet.service.ts         # create/accept/cancel — calls wallet.service.hold/release
│   │   ├── bet.state-machine.ts   # open → matched → awaiting_result → settled/refunded/cancelled
│   │   └── bet.routes.ts
│   ├── settlement/            # results ingestion + payout trigger
│   │   ├── results-poller.job.ts  # scheduled fixture/result polling
│   │   ├── settlement.service.ts  # resolves outcome, calls wallet.service.capture
│   │   └── fixtures.repository.ts
│   ├── payments/               # PaySuite integration
│   │   ├── paysuite.client.ts     # outbound calls (create payment, create payout)
│   │   ├── paysuite.webhook.ts    # inbound signature-verified, idempotent handler
│   │   └── payments.routes.ts
│   ├── notifications/
│   │   └── notification.service.ts
│   └── admin/                  # admin-only routes, reuses services above
│       └── admin.routes.ts
├── shared/
│   ├── db/                     # migrations, transaction helper
│   ├── events/                 # simple internal event bus (bet.accepted, wallet.credited, ...)
│   └── audit/                  # audit-log writer used by every mutating service
└── jobs/
    ├── expiry-sweeper.job.ts   # cancels unmatched bets past kickoff, refunds creator
    └── scheduler.ts
```

### Structure Rationale

- **wallet/ is isolated and has no inbound dependency from betting/payments/settlement's internals** — those modules only call `wallet.service` methods, never touch the ledger table directly. This is the single most important boundary in the whole system: it's what makes "no double-spend" enforceable in one place.
- **betting/ knows nothing about money mechanics**, only calls `hold()`/`release()`/`capture()`. This keeps the bet state machine simple and testable without needing DB transactions in its own tests.
- **settlement/ and payments/ are both "external world → wallet" adapters** and are structured the same way: verify/validate external input, resolve idempotency, then delegate the actual money movement to wallet.service.
- **jobs/ is where all time-based logic lives** (results polling, unmatched-bet expiry) so it's obvious what runs on a schedule vs. what's request-driven.

## Architectural Patterns

### Pattern 1: Double-Entry Append-Only Ledger (not mutable balance columns)

**What:** Every money movement is recorded as a set of ledger entries (debit one account, credit another) that always sum to zero for a given transaction. The wallet's "available balance", "locked balance", and "total balance" are *derived* by summing entries (or maintained as a cached/materialized value recomputed from entries), never stored as the sole source of truth in a mutable column.
**When to use:** Always, for this domain — financial correctness and full audit trail are explicit hard requirements in PROJECT.md.
**Trade-offs:** More upfront schema/design work and a slightly more complex balance-read query (or requires a maintained cache), vs. a simple `balance` column. In exchange: entries are immutable so nothing can silently corrupt history, every number is reconstructable/auditable, and "how did this balance get here" is always answerable — a hard requirement here ("auditoria e rastreabilidade completa").

**Example (conceptual entries for one settled bet):**
```
-- Bet created: creator locks 5 MT
ledger_entry(account=user_A_available, type=debit,  amount=5,  ref=bet_123_hold)
ledger_entry(account=user_A_locked,    type=credit, amount=5,  ref=bet_123_hold)

-- Bet accepted: opponent locks 5 MT (same pattern for user_B)

-- Bet settled, user_A wins, pot=10, commission=1 (10%)
ledger_entry(account=user_A_locked,    type=debit,  amount=5,  ref=bet_123_settle)
ledger_entry(account=user_B_locked,    type=debit,  amount=5,  ref=bet_123_settle)
ledger_entry(account=user_A_available, type=credit, amount=9,  ref=bet_123_settle)
ledger_entry(account=platform_revenue, type=credit, amount=1,  ref=bet_123_settle)
```

### Pattern 2: Hold / Capture / Release (two-phase fund locking)

**What:** Locking a balance is modeled as a `hold` (moves funds from `available` to `locked`, does not leave the wallet), which is later either `captured` (locked funds move to the winner / platform on settlement) or `released` (locked funds move back to `available` on cancellation/refund). This is the same pattern card-payment authorizations use.
**When to use:** Any time funds must be provisionally reserved before a final outcome is known — exactly the "create bet" and "accept bet" moments.
**Trade-offs:** Requires three wallet operations instead of one, but makes "locked balance" a first-class, always-correct concept instead of an ad hoc flag, and makes refund/cancel trivially safe (release is just the inverse of hold, same ledger pattern).

**Example:**
```typescript
// bet.service.ts
async function createBet(userId, matchId, prediction, amount) {
  await walletService.hold(userId, amount, { ref: `bet_${betId}_hold` }); // in same DB tx as bet insert
  await betRepository.insert({ status: 'open', creatorId: userId, amount, prediction });
}

async function settleBet(bet, winnerId, loserId) {
  const pot = bet.amount * 2;
  const commission = Math.round(pot * 0.10);
  await walletService.capture(winnerId, loserId, pot, commission, { ref: `bet_${bet.id}_settle` });
  await betRepository.updateStatus(bet.id, 'settled');
}
```

### Pattern 3: Idempotent Webhook Ingestion (dedupe key stored transactionally)

**What:** Every inbound webhook (PaySuite payment/payout confirmation) is first checked against a `processed_webhook_events` table keyed by the provider's `request_id` (unique constraint). The signature is verified (HMAC-SHA256 over the raw payload, constant-time compare) *before* any business logic runs. The dedupe-record insert and the wallet credit happen in the same DB transaction, so a retried/duplicate webhook either fully re-applies nothing or fully applies once — never half-applies.
**When to use:** Every external callback that moves money (deposit confirmation, withdrawal confirmation/failure). This is non-negotiable for a system that must never double-credit.
**Trade-offs:** Slight latency added per webhook (one extra unique-constraint insert) — irrelevant at this volume. Must also handle the provider's retry window: keep the dedupe record indefinitely (or at least well beyond PaySuite's documented retry period) rather than expiring it aggressively.

**Example:**
```typescript
// paysuite.webhook.ts
router.post('/webhooks/paysuite', async (req, res) => {
  const sig = req.headers['x-webhook-signature'];
  const expected = hmacSha256(req.rawBody, process.env.PAYSUITE_WEBHOOK_SECRET);
  if (!timingSafeEqual(sig, expected)) return res.status(401).send();

  const event = JSON.parse(req.rawBody);
  await db.transaction(async (tx) => {
    const inserted = await tx('processed_webhook_events')
      .insert({ request_id: event.request_id, event_type: event.type })
      .onConflict('request_id').ignore();
    if (!inserted) return; // already processed — no-op, still return 200
    if (event.type === 'payment.success') {
      await walletService.credit(event.metadata.userId, event.amount, { ref: event.request_id }, tx);
    }
  });
  res.status(200).send(); // always ack quickly
});
```

## Data Flow

### Bet Lifecycle (state machine)

```
CREATE                ACCEPT                RESULT (settlement engine)         EXPIRY (sweeper job)
  │                     │                          │                                │
  ▼                     ▼                          ▼                                ▼
 open  ──────────► matched/escrowed ──────► awaiting_result ──┬──► settled          open ──────► cancelled
(creator's funds     (opponent's funds        (kickoff passed,   │   (winner paid,   (kickoff reached,
 held)                also held)                waiting for       │    commission     no opponent —
                                                 official result)  │    taken)         creator refunded)
                                                                   └──► refunded
                                                                       (match void/
                                                                        postponed
                                                                        beyond grace
                                                                        window — both
                                                                        sides released,
                                                                        no commission)
```

Additional edge: `open` → `cancelled` (manual, creator-initiated) is allowed only while status is still `open` (before an opponent accepts) — release the creator's hold, no commission.

### Bet → Ledger Data Flow

```
[User creates bet]
   → Bet Matching Engine validates (amount > 0, sufficient available balance, match not yet kicked off)
   → calls Wallet Service .hold(creatorId, amount)          [DB tx: ledger insert + bet insert]
   → Bet row: status=open

[Second user accepts]
   → Bet Matching Engine validates (bet still open, not own bet, sufficient balance, same device/IP heuristic check)
   → calls Wallet Service .hold(opponentId, amount)          [DB tx: ledger insert + bet update]
   → Bet row: status=matched, opponentId set

[Match kicks off → Settlement Engine marks awaiting_result]
   → Results Poller (scheduled job) polls Sports Data API for fixture status
   → on FT/official result: Settlement Engine resolves 1X2 outcome vs both users' predictions
   → calls Wallet Service .capture(winnerId, loserId, pot, commission)   [DB tx: ledger inserts + bet update to settled]
   → Notification Service fires "bet settled" event to both users

[Deposit via PaySuite]
   → Client calls Payments module → paysuite.client creates payment request → user redirected/prompted on phone (M-Pesa/e-Mola)
   → PaySuite sends webhook (payment.success) → signature verified → idempotency check → Wallet Service .credit(userId, amount)
   → Notification Service fires "deposit confirmed"

[Withdrawal via PaySuite]
   → User requests withdrawal → Wallet Service .hold(userId, amount) immediately (prevents double-withdraw while payout is in flight)
   → paysuite.client creates payout request
   → PaySuite webhook (payout.success/failed) → on success: Wallet Service .debit (capture the hold);
     on failure: Wallet Service .release (undo the hold), notify user
```

### Key Data Flows

1. **Money only ever moves through Wallet Service.** Every other module (betting, settlement, payments) calls `hold`/`release`/`capture`/`credit`/`debit` — none of them write to the ledger table directly. This is the enforceable boundary that satisfies "no race condition can allow double use of locked balance."
2. **External events (webhooks, results-poll) are the only triggers for money state changes after initial bet creation** — nothing settles or credits without an external confirmation, keeping the platform a pure custodian (matches the "never a counterparty" design decision in PROJECT.md).
3. **Audit trail is a side-effect of the ledger, not a separate system** — because entries are append-only and every mutation records a `ref` back to the originating bet/webhook/admin-action, the required "auditoria e rastreabilidade completa" falls out of Pattern 1 for free, provided discipline is maintained (no direct DB balance edits, ever — even by admin tooling, which should call the same wallet.service methods with an `admin_override` ref).

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| MVP / 0–1k users | Single monolith app (auth+wallet+betting+settlement+payments in one deploy), single Postgres instance, one background worker process for jobs (polling, sweeper). This is more than sufficient and avoids premature distributed-systems complexity. |
| 1k–100k users | Split background workers (webhook processing, results polling, sweeper) into a separate process/queue (e.g. a job queue like BullMQ) from the request-serving API, so a slow settlement job never blocks bet creation/acceptance latency. Add read replicas if admin/reporting queries start competing with hot-path wallet locks. |
| 100k+ users | Consider extracting the Wallet/Ledger service into its own deployable service with its own datastore, since it's the one component every other module depends on and the one with the strictest consistency requirements — everything else (betting, notifications) can scale horizontally more freely once it only talks to wallet via API/RPC instead of direct DB access. |

### Scaling Priorities

1. **First bottleneck: row-lock contention on hot wallet rows** during peak match windows (many bets on the same popular fixture, matched near kickoff). Mitigate by keeping wallet transactions extremely short (lock, validate, write, commit — no external calls inside the transaction) and by ensuring the results poller/settlement batch processes settlements without holding locks longer than necessary.
2. **Second bottleneck: sports-data API rate limits/latency** as fixture/result polling frequency needs to increase around kickoff times for many concurrent live matches — mitigate with a smarter polling schedule (poll more frequently only for fixtures with open/matched bets and only during/after their kickoff window) rather than blanket high-frequency polling of the full fixture list.

## Anti-Patterns

### Anti-Pattern 1: Simple mutable `balance` column as source of truth

**What people do:** Store `available_balance` and `locked_balance` as plain integer columns on the `users`/`wallets` table and update them directly with `UPDATE wallets SET balance = balance - X`.
**Why it's wrong:** No audit trail of *why* the balance changed, easy to introduce a code path that mutates balance without going through validation/locking, and reconciliation ("does the sum of all balances match total deposits minus withdrawals minus commission") becomes impossible to verify independently. This directly conflicts with the "full audit trail" and "no race conditions" requirements called out in PROJECT.md.
**Do this instead:** Append-only ledger entries (Pattern 1) with balance as a derived value (either computed live under a lock, or maintained as a materialized/cached column that is *only* ever updated inside the same transaction as the entries that justify it).

### Anti-Pattern 2: Settling bets synchronously inside the request that reports the result

**What people do:** Have an admin or a webhook-style call directly resolve and pay out a bet within a single web request triggered by the results feed's HTTP call/poll response.
**Why it's wrong:** Couples settlement timing to feed availability/latency, makes retries/failures hard to reason about, and risks partial settlement if the request is interrupted mid-batch (e.g. settling 50 bets on one match, crash after 30).
**Instead:** Treat settlement as a queued, idempotent job per (fixture, bet) — the poller only writes "this fixture is now FT with result X" to a fixtures table; a separate settlement job then processes all bets for that fixture, each in its own DB transaction, so a crash mid-batch just means the remaining bets get picked up on the next run (idempotent — already-settled bets are skipped).

### Anti-Pattern 3: Trusting client-supplied amounts/state for bet acceptance

**What people do:** Let the client tell the server "I accept bet 123 for 5 MT" and trust that value instead of re-reading the bet's actual stored amount server-side.
**Why it's wrong:** Opens the door to acceptance-time manipulation and mismatched pot amounts.
**Instead:** The accept-bet endpoint only ever takes a bet id; the amount to hold is always read fresh from the stored bet record server-side, inside the same transaction as the hold.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| PaySuite (M-Pesa/e-Mola/card gateway) | Outbound REST calls (Bearer token) to create payment/payout requests; inbound webhooks (`payment.success`/`payment.failed`) signed with HMAC-SHA256 in `X-Webhook-Signature` | Verify signature with constant-time compare before parsing; dedupe on the payload's `request_id`; treat webhook as the only source of truth for deposit/withdrawal confirmation — never mark a deposit "complete" from the client-side redirect alone. (LOW confidence — confirm exact endpoint/field names against live paysuite.tech/docs before implementation.) |
| Sports Data API (fixtures + results) | Scheduled polling job (not a webhook, unless the provider offers one) that reads fixture status/result and writes to an internal `fixtures` table; Settlement Engine reacts to changes in that table | Poll frequency should scale with proximity to kickoff (e.g. every few minutes pre-match for fixture/lineup changes, more frequently during/after the match window for FT result); always have a defined "grace window" (e.g. 48–72h) after scheduled kickoff with no official result before falling back to admin-review/void, so money never stays in limbo indefinitely if the feed is down or the match is abandoned. (LOW confidence — provider-specific behavior varies; confirm against the chosen provider's actual status/result fields in the STACK research.) |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Bet Matching Engine ↔ Wallet Service | Direct in-process function call (same DB transaction) in a monolith; would become an internal RPC/API call if ever split into services | Bet engine never writes to ledger tables directly — always through wallet.service's hold/release/capture methods |
| Settlement Engine ↔ Wallet Service | Same as above — settlement calls `capture`/`release`, never writes ledger rows itself | Settlement Engine's own idempotency (per fixture+bet) prevents double-settlement even if the job runs twice |
| Payments module ↔ Wallet Service | Same pattern — webhook handler calls `credit`/`debit`/`release`, all within one DB transaction that also records the dedupe key | This is the boundary most exposed to untrusted external input; signature verification happens strictly before this boundary is crossed |
| Admin Panel ↔ everything | Admin actions call the *same* service-layer methods as regular flows (with an `admin_override`/`actor` field recorded in the audit ref), never raw SQL | Preserves the "every money movement has an audit trail" guarantee even for manual admin corrections |

## Sources

- [Solving the Double Spend: System Design Patterns for Bulletproof Fintech (Medium/CodeToDeploy)](https://medium.com/codetodeploy/solving-the-double-spend-system-design-patterns-for-bulletproof-fintech-ee5d73f33415) — MEDIUM confidence
- [How to Build a Bank Ledger in Golang with PostgreSQL using Double-Entry Accounting (freeCodeCamp)](https://www.freecodecamp.org/news/build-a-bank-ledger-in-go-with-postgresql-using-the-double-entry-accounting-principle/) — MEDIUM confidence
- [Fintech Eng Challenges: Different Balance Types in a Wallet (Modern Treasury)](https://www.moderntreasury.com/journal/fintech-eng-challenges-part-i-different-balance-types-in-a-wallet) — MEDIUM confidence
- [The race condition a stress test found in my double-entry ledger (DEV Community)](https://dev.to/xidoke/the-race-condition-a-stress-test-found-in-my-double-entry-ledger-and-how-i-fixed-it-b5o) — MEDIUM confidence
- [How to Implement Webhook Idempotency (Hookdeck)](https://hookdeck.com/webhooks/guides/implement-webhook-idempotency) — MEDIUM confidence
- [Webhook Idempotency and Deduplication (Hooklistener)](https://www.hooklistener.com/learn/webhook-idempotency-and-deduplication) — MEDIUM confidence
- [Webhook Handling Best Practices for Payment Systems (Sandorian)](https://sandorian.com/fintech/kb/webhook-handling-payment-systems) — MEDIUM confidence
- [PostgreSQL Documentation: Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html) — MEDIUM confidence (official docs)
- [Handling Concurrency with Row Level Locking in PostgreSQL (DEV Community)](https://dev.to/nickcosmo/handling-concurrency-with-row-level-locking-in-postgresql-1p3) — MEDIUM confidence
- [PaySuite official site/docs](https://paysuite.co.mz/en/) and [paysuite.tech/docs](https://paysuite.tech/docs) — LOW confidence (single-source, not independently cross-checked; re-verify exact fields at implementation time)
- [Football - Postponed or Abandoned Match Rules (Betfair)](https://support.betfair.com/app/answers/detail/10240-football--postponed-or-abandoned-match-rules/) — LOW confidence (traditional sportsbook rules, adapted here for a P2P context)
- [What Happens if my Bets are Cancelled, Postponed or Void? (The Punters Page)](https://www.thepunterspage.com/us/cancelled-or-postponed-void-bets/) — LOW confidence
- [2026 Guide: Optimize Sports Data API Latency, Reliability & Real-Time Performance (iSportsAPI)](https://www.isportsapi.com/en/blog/others-2323-2026-guide-optimize-sports-data-api-latency,-reliability-real-time-performance.html) — LOW confidence
- [Peer-to-Peer Sports Betting: The Model Behind Modern Exchanges (SX Bet Blog)](https://blog.sx.bet/sports-betting/guides/peer-to-peer-sports-betting/) — LOW confidence

---
*Architecture research for: P2P sports betting platform (Duelo)*
*Researched: 2026-07-09*
