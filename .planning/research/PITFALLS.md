# Pitfalls Research

**Domain:** P2P sports betting platform — wallet/escrow ledger + mobile money (M-Pesa/e-Mola via PaySuite) + automatic settlement against an external results feed (Mozambique)
**Researched:** 2026-07-09
**Confidence:** MEDIUM (cross-checked web sources on ledger/payments engineering patterns and betting-settlement conventions; LOW on Mozambique-specific gambling licensing detail — treat as a flag for legal counsel, not a legal conclusion)

## Critical Pitfalls

### Pitfall 1: Check-then-act race condition on wallet balance (double-spend)

**What goes wrong:**
Two concurrent requests (e.g., user creates a bet while accepting another, or two devices simultaneously try to use the same "available" balance) both read the same balance, both pass the "sufficient funds" check against the stale value, and both proceed to lock/debit — over-committing funds that don't exist. This is the single most damaging bug class for Duelo because the whole product promise ("dinheiro protegido em custódia") depends on it never happening.

**Why it happens:**
Naive implementations read balance → validate in application code → write new balance, with no locking between read and write. Under low load this never surfaces; it only appears under concurrency, which is exactly when a growing user base with many simultaneous bet creations/acceptances hits it — often first noticed in production, not in dev/testing.

**How to avoid:**
- Model the wallet as an **append-only double-entry ledger** (every movement is a debit + credit pair, balance is *derived*, never stored as a single mutable field that gets directly decremented).
- Wrap every balance-affecting operation (create bet → lock stake, accept bet → lock stake, settle → unlock+transfer, cancel → unlock+refund) in a single DB transaction that takes a row lock on the wallet (`SELECT ... FOR UPDATE` / `FOR NO KEY UPDATE` in Postgres) before validating sufficient available balance.
- Keep these transactions short (lock → validate → write → commit, nothing else in between) and always acquire multi-row locks (e.g., both bettors' wallets in a settlement) in a **consistent global order** (e.g., by user ID) to avoid deadlocks.
- Store amounts as integer minor units (e.g., cents/centavos of MT), never floats.
- Add a unique idempotency key per business action (bet creation, acceptance, settlement) so a retried request can't double-execute even if the lock alone were bypassed.

**Warning signs:**
- Any code path that does `balance = getBalance(); if (balance >= amount) { updateBalance(balance - amount) }` without a transaction/lock spanning both statements.
- Load/concurrency tests are absent from the test plan for wallet endpoints.
- Balance is stored as a single mutable numeric column with no ledger/transaction history backing it.

**Phase to address:**
Wallet & ledger foundation phase (before bet creation/acceptance is built) — this must be the architectural bedrock, not a later hardening pass.

---

### Pitfall 2: Non-idempotent mobile money webhook handling (duplicate credit)

**What goes wrong:**
PaySuite/M-Pesa/e-Mola webhooks are delivered **at-least-once** — network blips, timeouts, or slow handler responses cause the provider to retry the same deposit-confirmation callback. If the handler blindly credits the wallet on every callback received, a single real deposit gets credited two or more times, creating money the user never actually deposited.

**Why it happens:**
Developers treat the webhook as a simple "add money" trigger instead of as an event that must be deduplicated and reconciled against a known pending transaction record. Handlers that take too long to process (before responding 200) also cause providers to time out and retry, compounding the risk.

**How to avoid:**
- Every deposit initiation creates a `transaction` record in `PENDING` state with your own reference ID sent to PaySuite.
- The webhook handler's only synchronous job is: look up the transaction by provider reference ID, check current state, and if already `COMPLETED`/`REVERSED`, return 200 immediately without touching the wallet. Only transition `PENDING → COMPLETED` (and credit the wallet, inside the same locked transaction) exactly once, guarded by a unique constraint on the provider transaction ID.
- Respond fast (target the provider's stated timeout, ~60s ceiling) and do heavier post-processing (notifications, stats) asynchronously after acknowledging.
- Never mark a deposit as successful from a client-side redirect/callback alone — the server-verified webhook (or a server-side status poll as fallback) is the only source of truth.
- Apply the identical idempotency discipline to withdrawal callbacks and to settlement payouts.

**Warning signs:**
- Webhook handler directly increments balance without checking existing transaction state first.
- No unique index/constraint on `(provider, provider_transaction_id)`.
- No reconciliation job comparing PaySuite's transaction list against your local ledger.

**Phase to address:**
Mobile money integration phase (deposits/withdrawals) — build the idempotency/reconciliation pattern once and reuse it for withdrawals and payouts.

---

### Pitfall 3: Trusting client-provided amounts or state for financial actions

**What goes wrong:**
Any endpoint where the client sends "amount to bet", "amount to withdraw", or a bet's/match's current status, and the server trusts it instead of recomputing/validating server-side, is exploitable. A known real-world pattern: a user intercepts and edits a POST body to change an amount, resulting in a bet accepted for less than intended, a withdrawal for more than the available balance, or a settlement paid out based on a forged "match already resolved" flag.

**Why it happens:**
Convenient during rapid MVP development — read `req.body.amount` and use it directly — and it "works" in every manual test because the developer's own client sends correct values.

**How to avoid:**
- Server is the single source of truth for: available balance, bet stake at creation, whether a bet is still open/acceptable, match state, and official result. The client only ever *proposes* an action (e.g., "create bet with stake X"); the server independently validates against its own current state before committing.
- Never accept a "confirm payment" or "match settled" signal directly from a mobile client — only from your own backend's webhook/poll of PaySuite and the results API respectively.
- Re-validate bet-acceptance terms (same market, same event, opposite prediction, exact matching stake) server-side even if the client UI already enforced it.

**Warning signs:**
- Any financial mutation endpoint whose primary validation is "does this match what the client says" rather than "does this match server records."
- Bet stake, odds-implied payout, or match result ever read from request payload instead of recomputed.

**Phase to address:**
Bet creation/acceptance phase and settlement phase — enforce as a standing API design rule from the first financial endpoint written.

---

### Pitfall 4: Settlement edge cases — postponed, abandoned, or void matches left unhandled

**What goes wrong:**
The MVP happy path (match kicks off, finishes, result comes back 1X2, winner is paid) is easy. What breaks products is the long tail: a match is postponed before kickoff, abandoned mid-game, has its result overturned after an initial feed, or the results API is late/unavailable at the scheduled settlement time. If these states aren't modeled, escrowed funds get stuck indefinitely, or worse, a bet gets force-settled on incomplete/wrong data.

**Why it happens:**
Teams design the settlement engine around "wait for result → pay winner" and don't build the state machine for "no result yet," "match won't happen as scheduled," or "result was corrected." Duelo's own design decision — the opponent always bets "against" the creator's prediction rather than picking a specific outcome — already eliminates the 3-way-push ambiguity, but does **not** eliminate the postponed/abandoned/void case, which the current requirements don't yet mention.

**How to avoid:**
- Define an explicit match/bet-pair state machine: `OPEN → MATCHED → AWAITING_RESULT → SETTLED` plus side-states `POSTPONED`, `ABANDONED`, `VOID/REFUNDED`, `SETTLEMENT_DISPUTED`.
- Adopt industry convention as a default policy (confirm with product decision, don't leave implicit): if a match doesn't start within a defined grace window (e.g., 24-48h) of original kickoff, or is abandoned before a result can be determined, **void the bet pair and refund both stakes** (no commission charged) rather than guessing a winner.
- Treat the first result received from the sports-data API as **provisional** for a short confirmation window before final settlement/payout, especially for late red cards, VAR-driven score changes, or matches marked "abandoned" and later awarded a technical result by the competition authority — do not pay out instantly on the very first data point if the provider itself flags a match as unusual.
- Build a manual admin override/hold path (already scoped in the admin panel) specifically for "settlement stuck/disputed" bet pairs, with full audit trail.
- Build a scheduled reconciliation job that finds `AWAITING_RESULT` bet pairs whose match kickoff+typical duration has passed with no result, and pages an operator rather than silently leaving funds locked forever.

**Warning signs:**
- No requirement or design doc mentions postponed/abandoned/void handling (currently true for Duelo's Active Requirements list — this is a gap to close before/during the settlement phase).
- Settlement logic has no "grace/confirmation window" before paying out.
- No visibility for admins into bets stuck in `AWAITING_RESULT` past expected settlement time.

**Phase to address:**
Settlement/results-integration phase. This should be treated as core scope, not a "nice to have" edge case, given funds are escrowed and users' trust hinges on funds never getting stuck.

---

### Pitfall 5: Sports-results API latency, incorrect data, or unavailability driving wrong/delayed settlement

**What goes wrong:**
Automatic settlement is only as trustworthy as the results feed. Real-world data providers have latency windows, occasional incorrect data pushed and later corrected, and outages. If Duelo settles the instant it sees *a* result with no cross-check or correction window, an initial wrong score can trigger incorrect payouts that then have to be clawed back — which is far more damaging to trust (and legally messier) than a short settlement delay.

**Why it happens:**
"Automatic settlement" is treated as a single API call + trust, rather than a pipeline with staleness/consistency checks, because building the corrective path is unglamorous and doesn't show up in a demo.

**How to avoid:**
- Prefer a results provider that exposes both event-occurrence time and data-ingestion/confirmation metadata (this is what the recorded decision to use an external API already anticipates as "custo recorrente e disponibilidade/latência... risco a mitigar" — make the mitigation concrete).
- Add a short confirmation delay after full-time before triggering settlement (e.g., don't settle at first "FT" flag; wait a small buffer, or require the same final score from the feed on two consecutive polls) to absorb this specific known failure mode.
- Build an explicit **correction/reversal path**: if the provider later corrects a result after settlement already happened, the system needs a documented (even if manual-admin-triggered in MVP) process to reverse an incorrect payout, not just "hope it doesn't happen."
- Have a fallback/alerting path for provider downtime at settlement time (queue the bet pair as `AWAITING_RESULT`, alert ops, don't silently retry forever without visibility).

**Warning signs:**
- Settlement code calls the results API once and immediately pays out with no staleness or cross-check logic.
- No monitoring/alert on results-API error rate or latency.
- No documented process for "what if we already paid out the wrong winner."

**Phase to address:**
Settlement/results-integration phase, alongside Pitfall 4.

---

### Pitfall 6: Gambling-adjacent regulatory exposure treated as "figure it out later"

**What goes wrong:**
Mozambique regulates gambling under Law 1/2010 (revised 2022/2024) through the Inspecção Geral de Jogos (IGJ), and online **sports betting specifically requires a Sports Betting License** issued by IGJ/Ministry of Tourism — this appears to be the only category of online gambling license currently actively issued in the country (online casino has no clear licensing path yet, per available sources). A P2P/exchange-style product where users bet against each other on sports outcomes is highly likely to still be classified as a form of sports betting requiring this license, even though the platform frames itself as a neutral custodian rather than "the house." Launching and gaining traction before this is resolved risks forced shutdown, seizure of custodied user funds, or personal liability for founders — a far worse outcome than a slower, compliant launch.

**Why it happens:**
"We're just an intermediary, not the house" feels like it sidesteps gambling regulation, but regulators generally look at the underlying activity (real-money wagering on uncertain sports outcomes) rather than the intermediation structure. Early-stage teams also deprioritize this because it's not a coding task and doesn't block writing the app.

**How to avoid:**
- Treat licensing as a **parallel workstream from day one**, not a post-launch concern — engage a local gambling-law advisor early to confirm whether Duelo's custodian/P2P model needs the Sports Betting License, and what the realistic cost/timeline is (secondary sources found conflicting investment-threshold figures — do not rely on web search results for this number; get it from counsel or the regulator directly).
- Keep the 18+ age gate (already scoped) but be aware the current MVP plan explicitly defers document-based KYC — flag this as a regulatory risk to revisit the moment transaction volume or scrutiny increases, not as a permanent decision.
- Design the audit/traceability requirements (already scoped in Active Requirements — "Auditoria e rastreabilidade completa") to also satisfy whatever reporting a license/regulator would require (transaction logs, user identity records, dispute records) so compliance isn't a rebuild later.
- Do not present this section's findings as legal advice to the product owner — flag explicitly that a local specialized advisor must confirm applicability before/at launch.

**Warning signs:**
- No named legal advisor or compliance contact by the time the product nears public launch.
- Marketing language that leans on "we're not gambling, it's a game between friends" as a substitute for actual legal clearance.

**Phase to address:**
Should be raised at the milestone/roadmap level as a non-engineering parallel track starting immediately, independent of any single build phase — but the audit/logging engineering work should land in the wallet/ledger and admin-panel phases so it's available if/when compliance requires it.

---

### Pitfall 7: Collusion / self-betting via linked accounts undermining "P2P" integrity

**What goes wrong:**
Because Duelo pays the winner (pote - 10% commissão) and the loser simply loses their stake, a bad actor can create two accounts, have one "create" a bet and the other "accept" it, and effectively launder/cycle funds while draining only 10% each round — or worse, exploit promotional balances or referral bonuses this way if those are added later. Left undetected, this also lets the same person guarantee a "win" against themselves in edge cases (e.g., manipulating which account times the acceptance) or simply pollutes stats/leaderboards.

**Why it happens:**
Teams build the "prevent double balance usage" heuristic (already scoped for Duelo) but stop at single-account level rather than cross-account device/IP correlation, since the latter requires additional data collection and review tooling that's easy to defer.

**How to avoid:**
- Duelo's own requirements already flag "deteção de padrões suspeitos (mesmo dispositivo/IP apostando contra si mesmo)" as in-scope for MVP — implement this as: capture device fingerprint + IP on bet creation and acceptance, and flag (don't necessarily auto-block) same-device/same-IP pairs matched against each other for manual admin review before payout, consistent with the "hold for review" pattern used industry-wide rather than instant auto-block (which creates false-positive friction for e.g. two friends on the same home WiFi).
- Log enough data (device ID, IP, timestamps of create/accept) from day one even if the review process is manual in MVP — retrofitting this after volume grows is much harder than collecting it from the start.
- Explicitly defer advanced ML-based collusion detection (already correctly marked Out of Scope) but make sure the schema/logging groundwork doesn't preclude adding it later.

**Warning signs:**
- No device/IP capture on bet creation/acceptance endpoints.
- Admin panel has no "flagged bets" or "suspicious pairs" view (already scoped as "denúncias" — make sure automatic flags feed into the same review queue as user reports).

**Phase to address:**
Bet creation/acceptance phase (data capture) + admin panel phase (review queue/tooling).

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Storing wallet as a single mutable `balance` column instead of a ledger of movements | Faster to build, simpler queries | No audit trail, no reconciliation, race conditions harder to fix retroactively without a painful migration | Never — this is a foundational decision, get it right in phase 1 |
| Deferring idempotency keys on webhook/settlement endpoints "until we see duplicates in practice" | Ships faster | Real financial damage (duplicate credits/payouts) before anyone notices; hard to detect after the fact without transaction-level audit logs | Never for money-moving endpoints; acceptable to defer only on read-only/notification endpoints |
| Settling instantly on first result received from the sports API, no confirmation window | Faster settlement, "feels magic" in demos | Occasional wrong-result payouts requiring manual clawback, eroding user trust in "automatic and reliable" core value prop | Acceptable only in a closed beta with real-money limits low enough that a clawback is financially survivable |
| Manual-only postponed/abandoned match handling (admin resolves by hand) instead of automated state machine | Less settlement-engine complexity upfront | Doesn't scale past a handful of concurrent open bets; slow manual resolution damages trust when funds sit locked | Acceptable for a very early MVP with low bet volume, but must be flagged as a known gap and prioritized once volume grows |
| Skipping document KYC, relying on age-confirmation checkbox only | Removes onboarding friction, faster growth | Regulatory exposure grows with volume; harder to retrofit KYC onto an existing user base without friction/churn | Acceptable at MVP per explicit product decision, but should have a defined trigger (volume/regulatory signal) for when to add it |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|-------------------|
| PaySuite (M-Pesa/e-Mola) | Trusting a client-side "payment successful" redirect instead of the server-verified webhook | Only credit wallet on verified webhook (or authenticated server-side status poll as fallback); treat client redirect as UX-only, not a truth signal |
| PaySuite (M-Pesa/e-Mola) | Not deduplicating retried webhook deliveries | Unique constraint on provider transaction reference + idempotent state-machine transition (`PENDING → COMPLETED` exactly once) |
| Sports results API | Settling the instant any result payload arrives, without freshness/consistency check | Add a short confirmation buffer post full-time and/or require result stability across polls before triggering payout |
| Sports results API | No handling for provider downtime/timeout at scheduled settlement time | Queue as `AWAITING_RESULT` with alerting/monitoring; never let settlement fail silently |
| Sports results API | No plan for provider issuing a correction after payout already happened | Documented (even if manual/admin-driven in MVP) reversal process for post-settlement corrections |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Long-held row locks on wallet rows during multi-step settlement logic | Growing lock wait times, occasional deadlocks under concurrent settlement of many matches at once (e.g., end of a football matchday) | Keep the locked transaction minimal (lock, validate, write, commit); do notifications/stats updates outside the lock, asynchronously | Noticeable once dozens of matches settle within the same short window (e.g., Saturday afternoon Moçambola + European fixtures) |
| Polling the results API per-bet-pair instead of per-match | Redundant API calls, hitting provider rate limits as bet-pair volume grows on popular matches | Poll per unique match/fixture, fan out settlement to all bet pairs on that match once a result is confirmed | Breaks once a single popular match (e.g., a Champions League fixture) has many concurrent bet pairs |
| No indexing/partitioning strategy on the ledger's transaction history table | Slow wallet balance/history queries as transaction volume grows | Index by user + created_at from day one; consider partitioning by time once volume is large | Becomes noticeable in the tens-of-thousands of transactions range for a single active user or the platform overall |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Trusting client-sent bet stake/amount instead of server-validated value | Manipulated requests could create bets or withdrawals at incorrect amounts | Server always revalidates amount/state against its own authoritative records before any financial mutation |
| No idempotency key on bet-acceptance endpoint | Rapid double-tap or retried request on flaky mobile connection could double-accept the same bet or double-lock balance | Idempotency key per action, unique constraint enforced at DB level, not just application logic |
| Weak/no device-IP correlation for same-user collusion | Users game the P2P model by betting against themselves via a second account | Capture device fingerprint + IP at bet creation/acceptance; flag matched same-device/IP pairs for review before payout |
| Admin panel with broad, unaudited financial actions (manual balance adjustment, forced settlement) | Insider abuse or accidental fund manipulation with no trace | Every admin financial action writes an audit log entry (who, what, when, why) — ties directly into the already-scoped audit/traceability requirement |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Heavy JS bundle / rich animations assuming fast, stable connections | Slow or failed loads on 3G/entry-level Android devices common in the target market, users abandon before completing a deposit or bet | Aggressively minimize bundle size, lazy-load non-critical UI, text-first rendering with progressive enhancement |
| No visible retry/offline handling on deposit/withdrawal or bet-creation flows | A dropped connection mid-flow leaves the user unsure if their money moved or their bet was placed, causing support load and distrust | Explicit pending/processing states, visible retry actions, and idempotent submission so retrying never double-charges or double-bets |
| Silent long waits with no feedback during PaySuite payment confirmation | Users assume the app is broken and force-close, potentially retrying and causing duplicate payment attempts | Clear "waiting for confirmation from M-Pesa/e-Mola" state with expected wait time and a safe retry/cancel path |
| Assuming users can complete complex flows (e.g., choosing a market before a bet) in one pass | Contradicts Duelo's own stated goal of sub-30-second bet creation for very small stakes (e.g., 5 MT) | Ruthlessly minimize steps/taps in the create-bet flow; pre-fill defaults (1X2 already fixed as the only market) and optimize for thumb-reachable, single-screen creation |
| Over-polishing visuals (custom animations, heavy imagery, elaborate onboarding) before validating core loop | Slows MVP delivery, adds surface area for bugs, doesn't move the metric that matters (successful matched + settled bets) | Prioritize a clean, trustworthy, but simple visual language (clear balance display, clear bet state, clear win/loss feedback) over decorative polish; add motion/detail after the core loop is validated |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Wallet balance display:** Often missing a clear separation of "disponível" vs "bloqueado" in every screen that shows money — verify every balance-affecting action updates both instantly and consistently, and that locked funds are never spendable.
- [ ] **Bet creation flow:** Often missing handling for "match starts before anyone accepts" (auto-cancel + refund is scoped, but verify it actually fires reliably near kickoff, including for matches with unpredictable/delayed kickoff times).
- [ ] **Deposit flow:** Often missing the "payment initiated but webhook never arrives" case — verify there's a timeout + reconciliation/status-check path, not just infinite "pending."
- [ ] **Settlement engine:** Often missing postponed/abandoned/void match handling entirely (see Pitfall 4) — verify the state machine explicitly covers these states, not just "result received → pay out."
- [ ] **Admin panel:** Often missing audit trail on manual interventions (forced settlement, manual balance adjustment, unblocking a user) — verify every admin action is logged with actor, timestamp, and reason.
- [ ] **Fraud heuristics:** Often missing actual enforcement — a "detection" that logs a flag but has no review queue or blocking mechanism isn't prevention, just data collection — verify flagged pairs are actually held/reviewed before payout.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|------------------|
| Wallet race condition already caused an over-committed/negative available balance | HIGH | Freeze affected accounts, reconstruct correct balance from the immutable ledger history (this is why ledger-first design matters), manually adjust with a logged admin correction transaction, notify affected users |
| Duplicate webhook credited a deposit twice | MEDIUM | Reconcile against PaySuite's transaction records for the reference ID, reverse the duplicate credit as a logged correction transaction, notify the user if their balance changes |
| Settlement paid the wrong side due to an incorrect/early result | HIGH | Reverse the incorrect payout via a logged correction transaction, re-settle correctly once the confirmed result is in, proactively notify both users with an explanation and, if funds were already withdrawn, handle as a support/collections case |
| Regulatory gap discovered post-launch (license required but not held) | HIGH | Pause new user/deposit onboarding in the affected jurisdiction scope while pursuing licensing, keep existing user funds fully accessible/withdrawable (never freeze user funds due to the platform's own compliance gap), engage counsel immediately |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|---------------|
| Wallet race condition / double-spend | Wallet & ledger foundation phase | Concurrency/load test: fire simultaneous create+accept requests against the same balance and confirm exactly one succeeds when funds are insufficient for both |
| Non-idempotent mobile money webhooks | Mobile money integration phase | Replay the same webhook payload multiple times in tests and confirm the wallet is credited exactly once |
| Trusting client-provided amounts/state | Bet creation/acceptance phase, settlement phase | Code review checklist item: every financial mutation re-derives amount/state server-side, never reads it as final from client payload |
| Postponed/abandoned/void match handling | Settlement/results-integration phase | Simulate a postponed and an abandoned match in a staging results feed and confirm both stakes are refunded, commission not charged |
| Sports-results API latency/incorrect data | Settlement/results-integration phase | Inject a delayed/incorrect mock result and confirm the settlement engine doesn't pay out until confirmation criteria are met, and supports manual reversal |
| Gambling regulatory exposure | Parallel non-engineering track from project start; audit/logging requirements land in wallet + admin phases | Legal sign-off checkpoint before public (non-beta) launch; confirm audit logs satisfy whatever a regulator/license would require |
| Collusion/self-betting via linked accounts | Bet creation/acceptance phase (data capture), admin panel phase (review queue) | Manually create two accounts on the same device/IP, bet against each other, and confirm the pair is flagged into an admin review queue before payout |

## Sources

- [Solving the Double Spend: System Design Patterns for Bulletproof Fintech](https://medium.com/codetodeploy/solving-the-double-spend-system-design-patterns-for-bulletproof-fintech-ee5d73f33415) — MEDIUM confidence
- [The race condition a stress test found in my double-entry ledger](https://dev.to/xidoke/the-race-condition-a-stress-test-found-in-my-double-entry-ledger-and-how-i-fixed-it-b5o) — MEDIUM confidence
- [SELECT FOR UPDATE in PostgreSQL — Stormatics](https://stormatics.tech/blogs/select-for-update-in-postgresql) — MEDIUM confidence
- [The $2.3 Million Lesson: Why Your PostgreSQL Money Transactions Are Probably Wrong](https://dev.to/igornosatov_15/-the-23-million-lesson-why-your-postgresql-money-transactions-are-probably-wrong-15l1) — MEDIUM confidence
- [Handling Payment Webhooks Reliably (Idempotency, Retries, Validation)](https://medium.com/@sohail_saifii/handling-payment-webhooks-reliably-idempotency-retries-validation-69b762720bf5) — MEDIUM confidence
- [Webhook Handling Best Practices for Payment Systems — Sandorian](https://sandorian.com/fintech/kb/webhook-handling-payment-systems) — MEDIUM confidence
- [M-Pesa API Integrations for Kenyan Platforms](https://blog.statum.co.ke/blog/apis-integrations-m-pesa-building-payment-ready-kenyan-platforms) — MEDIUM confidence
- [Football — Postponed or Abandoned Match Rules (Betfair)](https://support.betfair.com/app/answers/detail/10240-football--postponed-or-abandoned-match-rules/) — MEDIUM confidence
- [How Does BetNow.eu Handle Abandoned or Postponed Matches?](https://www.betnow.eu/blog/how-does-betnow-eu-handle-abandoned-or-postponed-matches/) — MEDIUM confidence
- [Sports API Performance Metrics: Latency, SLA, Uptime & Data Freshness](https://www.isportsapi.com/en/blog/others-2344-sports-api-performance-metrics-latency,-sla,-uptime-data-freshness.html) — MEDIUM confidence
- [SportsDataIO Powers Fast and Accurate Bet Settlements for Entain](https://sportsdata.io/entain-case-study) — MEDIUM confidence
- [Gambling law and regulation in Mozambique — CMS Expert Guides](https://cms.law/en/int/expert-guides/cms-expert-guide-to-gambling-laws-in-africa/mozambique) — LOW confidence (secondary aggregator; confirm with local counsel)
- [Mozambique Gaming Licence — gamblingdatabases.com](https://gamblingdatabases.com/licenses/mozambique-gaming-licence/) — LOW confidence
- [Gambling License in Mozambique — Gofaizen & Sherle](https://gofaizen-sherle.com/gambling-license/mozambique) — LOW confidence
- [PaySuite — Online payments with M-Pesa, e-Mola and cards](https://paysuite.co.mz/en/) — MEDIUM confidence (vendor's own site)
- [Accepting Payments in Mozambique: PSPs, Compliance & Fees — PayAtlas](https://payatlas.com/countries/mozambique-mz) — MEDIUM confidence
- [UX for Low-Connectivity Environments](https://medium.com/x-periment-asteroid/ux-for-low-connectivity-environments-design-apps-that-work-when-the-internet-doesnt-2f929c1784e9) — MEDIUM confidence
- [UI/UX Design Best Practices for Mobile Apps in Low-Bandwidth Areas](https://sanketlade.com/ui-ux-design-best-practices-for-mobile-apps-in-low-bandwidth-areas/) — MEDIUM confidence
- [Beyond Matched Betting: A Technical Guide to Detect and Dismantle Multi-Accounting Rings](https://greip.io/blog/Beyond-Matched-Betting-A-Technical-Guide-for-iGaming-Platforms-to-Detect-and-Dismantle-MultiAccounting-Rings-376) — MEDIUM confidence
- [Online Gambling Fraud: What is It & How to Prevent It — SEON](https://seon.io/resources/online-gambling-fraud/) — MEDIUM confidence
- [Implementing the BBE Agent-Based Model of a Sports-Betting Exchange (arXiv)](https://arxiv.org/pdf/2108.02419) — MEDIUM confidence (matching-engine mechanics reference)
- [MVP UX: Design Principles for Startups — Excited](https://excited.agency/blog/mvp-ux-design) — MEDIUM confidence

---
*Pitfalls research for: P2P sports betting platform (wallet/escrow + mobile money + automatic settlement), Mozambique MVP*
*Researched: 2026-07-09*
