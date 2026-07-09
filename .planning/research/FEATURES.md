# Feature Research

**Domain:** P2P (peer-to-peer) sports betting — escrowed 1X2 wagers, mobile-money settled, Mozambique v1
**Researched:** 2026-07-09
**Confidence:** MEDIUM (web-sourced, cross-checked across multiple competitor products and fintech pattern sources; no first-party access to Sporttrade/Novig/Polymarket internals or Mozambican regulatory text — see Gaps)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels broken or untrustworthy — not "incomplete," actively unsafe with real money.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Create bet (match, prediction, stake) | Core loop entry point; every P2P/exchange product (Sporttrade, Novig, Kalshi, Kutt) starts here | LOW | Must be <30s per founder's UX bar. Single screen: match, side, stake. |
| Accept/match a bet | Without a matching mechanism there's no "peer" in peer-to-peer; Novig's model literally is "post odds/stake, another user matches it" | MEDIUM | v1 model is simpler than Novig/Sporttrade: no partial fills, no order book — one full-stake match closes the bet, which removes most matching-engine complexity. |
| Escrow / balance lock on both sides | Kutt's core differentiator vs informal friend-betting is "all bets are pre-funded, ensuring neither side can flake" — this is the guarantee users are paying 10% commission for | MEDIUM | Creator's stake locks at creation; opponent's stake locks at acceptance. Must be atomic (no window where a bet is "matched" but a lock failed). |
| Automatic settlement on official result | Kalshi/Polymarket both auto-pay from an oracle/result feed the moment resolution is available — manual settlement erodes trust and doesn't scale | HIGH | Result-feed latency/incorrectness is the single biggest operational risk (see PITFALLS). Needs idempotent, replay-safe settlement logic. |
| Cancellation + refund for unmatched bets | If a bet doesn't find an opponent before kickoff, the stake must return automatically — users will not tolerate "stuck" money | LOW-MEDIUM | Straightforward if triggered by match kickoff time from the sports-data API. |
| Manual cancel by creator (pre-match) | Standard "you can cancel an unfilled order" pattern from every exchange (Sporttrade limit orders, Kalshi/Polymarket open orders) | LOW | Only while status = open/unmatched. |
| Available vs. locked balance display | Fintech convention: "available balance" (spendable now) vs. "ledger balance" (settled total) is universal in banking/wallet UX — users self-audit against this daily | LOW-MEDIUM | Show: Available, Locked (in open/pending bets), Total. This is the #1 support-ticket preventer. |
| Full transaction history | Baseline expectation in every wallet product; also Mozambican users moving money via M-Pesa/e-Mola already expect a statement-like ledger from those apps | LOW-MEDIUM | Every debit/credit needs a reason code (deposit, stake-lock, stake-release/refund, payout, commission, withdrawal). |
| Deposit via mobile money | Non-negotiable for Mozambique — M-Pesa/e-Mola/mKesh is literally how the target audience moves digital money; card/bank rails would be a differentiator nobody asked for | MEDIUM | Via PaySuite aggregator. Needs idempotent webhook handling — mobile money confirmations can arrive late or duplicate. |
| Withdrawal via mobile money | Symmetric to deposit; users won't trust a wallet they can't cash out of | MEDIUM | Same idempotency/duplication concerns as deposit, plus needs a "pending withdrawal" state that also locks funds. |
| Bet-matched notification | Universal expectation once a "waiting for opponent" state exists — user needs to know their bet is live | LOW | Push/SMS. Must be a transactional notification, not bundled with promotional content (industry over-notifies; see PITFALLS/anti-feature). |
| Bet-settled notification (win/loss) | Same logic — settlement happens asynchronously (after full-time whistle + result-feed confirmation), user isn't watching the app | LOW | Should state amount won/lost and new balance, not just "result available." |
| Refund/cancellation notification | If a bet times out unmatched or is voided (e.g. match postponed), user needs an explicit "your money is back" signal — silence here reads as "stolen funds" | LOW | Critical trust-builder specifically for a P2P-with-real-money product in a market with low institutional trust in fintech. |
| Age gate (18+) at signup | Universal minimum for any wagering product, including Novig/Kutt's sweepstakes-model apps in the US | LOW | Self-declared checkbox is explicitly sufficient for v1 per founder decision — do not over-build this into document KYC. |
| Basic same-device/same-IP self-bet detection | Device fingerprinting + IP checks are the documented baseline fraud control even at small operators — needed because your product design (equal stake, opposite side, guaranteed winner) creates a direct commission-arbitrage incentive to bet against yourself and force the platform to pay itself out at even odds | MEDIUM | Minimum viable version: block/flag matches where creator and acceptor share a device ID or IP/subnet. Does not require ML — this is table stakes heuristic, not the "advanced collusion detection" the founder already scoped out. |
| Double-spend / race-condition prevention on balance locks | If two bets can lock the same MT at once, the platform can go insolvent on day one — this is the single most damaging failure mode possible in a real-money product | HIGH | Requires transactional balance updates (row-level locking / optimistic concurrency with version column) — not eventual consistency. This is infrastructure, but it is table stakes, not a nice-to-have. |
| User profile (basic) | Needed to have any concept of "opponent" and history; minimal version only | LOW | Name/username/avatar + bet count/win-loss record. Founder's PROJECT.md already scopes this in. |
| Admin visibility into money movement | Not user-facing, but table stakes for any real-money platform — you cannot operate without seeing deposits/withdrawals/open exposure | MEDIUM-HIGH | Founder already scoped a full admin panel; for MVP, the minimum viable admin surface is: user list, wallet balances, bet list (open/settled/cancelled), deposit/withdrawal log, and one place to see total platform exposure (sum of all locked balances) — see FEATURE PRIORITIZATION for what can wait. |

### Differentiators (Competitive Advantage)

Not required for trust/safety, but where Duelo can win against both traditional sportsbooks and informal/friend betting.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Sub-30-second bet creation UX | Traditional sportsbooks (bet slip, odds boards, multi-step) and even exchanges (Sporttrade's share-price UI) are heavier than "pick a side, pick an amount, done" | LOW-MEDIUM | This is explicitly the founder's stated wedge — a deliberately restrained UI is the differentiator, not a token differentiator to bolt on later. |
| No-vig / fair peer odds framing | Novig's entire pitch is "no house edge, price is set by users" — Duelo's 1:1 matched-stake model is even simpler to explain to a non-sophisticated Mozambican bettor than an order book | LOW | Marketing/positioning feature more than engineering, but the "you're not betting against the house" message is a real trust differentiator vs. incumbent sportsbooks. |
| Mobile-money-native, zero-bank-account flow | Global exchanges (Sporttrade, Novig, Kalshi) are card/bank/crypto-first and don't serve mobile-money-only users at all — this is an open lane, not a crowded one | MEDIUM | This alone may be enough differentiation for launch; no need to compete on bet-type variety. |
| Public win/loss track record & ranking | BettorEdge's differentiator is social proof/leaderboards around bettor skill; Duelo's PROJECT.md already includes a lightweight version (level, stats, ranking) | LOW-MEDIUM | Keep it read-only/passive for v1 (stats + ranking) — do not build the full social layer (see Anti-Features) yet. |
| Instant, fully automated payout (no cash-out delay) | Traditional sportsbooks and even some exchanges have withdrawal review delays; if Duelo can settle-and-release-to-available-balance within seconds of the result feed firing, that's a felt difference for small-stake, high-frequency bettors | MEDIUM-HIGH | Depends entirely on result-feed reliability (see PITFALLS) — the differentiator is real but fragile if the data source is flaky. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but would dilute the "small, very well-designed core loop" the founder explicitly wants for v1.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Order-book / partial-fill matching (Sporttrade/Novig/Kalshi style) | "Real" exchanges let you buy/sell at any price and size, which feels more sophisticated | Massively increases engineering complexity (matching engine, partial settlement, position netting) for a market of small, casual bettors placing ~10 MT bets — solves a liquidity problem Duelo doesn't have yet at this scale | Keep the founder's simpler model: full-stake 1-for-1 match, opponent always takes "the other side" of a binary framing. Revisit order-book style matching only if liquidity/volume data shows single-opponent matching is a bottleneck. |
| Multiple market types (over/under, handicap, correct score) at launch | Traditional sportsbooks offer dozens of markets per match; feels like "missing features" vs incumbents | Each market type multiplies settlement logic, result-feed data requirements, and QA surface — directly conflicts with founder's "small, well-designed core loop first" | Already correctly scoped to v2+ in PROJECT.md; ship 1X2 only, expand once the create→match→settle loop is proven reliable. |
| Chat / social messaging between bettors | Informal friend-betting apps (Kutt, BroThrow) lean into social/community as their hook | Introduces moderation, abuse, and harassment surface for a P2P money product before the core trust mechanics (escrow, settlement) are even validated | Defer; the win/loss profile + ranking already gives a lightweight social signal without needing real-time chat/moderation infrastructure. |
| Full social layer (leaderboards, groups, private betting circles, feeds) | BettorEdge and similar competitors build entire communities around this | Distracts from validating the core financial loop; leaderboards/groups need retention and volume data that doesn't exist yet at MVP | Defer to v1.x/v2 once "does the matching+escrow+settlement loop work reliably" is answered. |
| Full document-based KYC (ID upload, liveness check) at signup | "KYC is standard in gambling" is true for licensed, high-volume operators (per KYC industry sources) | Adds signup friction the founder has explicitly rejected for v1, and is disproportionate for a small-stake, single-country product pre-regulatory requirement | Self-declared 18+ checkbox only, as already decided; revisit when volume/regulatory pressure (per PROJECT.md's own noted risk) actually materializes. |
| Advanced ML-based collusion/fraud detection | "Fraud is a $1.2B problem industry-wide" headlines suggest sophisticated tooling is required from day one | Overkill for MVP volume; behavioral-pattern ML needs a data corpus that doesn't exist yet, and the founder has already explicitly scoped this out | Ship the basic heuristic (same device/IP flag on creator vs. acceptor pairs) and log everything for a future ML pass once there's real fraud data to train on. |
| Live/in-play betting | Exchanges like Sporttrade lean heavily on live betting and cash-out as core value | Requires real-time odds/line movement infrastructure and much tighter result-feed integration (partial-match state, live price risk) — a different, harder product than "pre-match 1X2 P2P bet" | Explicitly out of scope; v1 is pre-match only, matching PROJECT.md's "before kickoff" cancellation logic. |
| Cash-out / sell your position before the match ends | Sporttrade's signature feature; feels like a natural evolution | Requires a live pricing mechanism and a counterparty willing to buy the position — meaningless without an order book, and Duelo doesn't have one by design | Not applicable until/unless Duelo evolves toward an exchange model; not a v1 gap. |
| Promotional/marketing push notifications (bonuses, "bet now" nudges) | Industry data shows heavy promotional notification use drives short-term engagement (35-50% CTR vs 2-3% email) | Documented consumer-harm and regulatory-scrutiny pattern (93% of major sportsbook notifications are promotional; regulators and consumer groups are actively pushing back) — also erodes trust in a P2P product whose pitch is fairness, not house-driven engagement | Keep notifications strictly transactional (matched, settled, refunded) for v1; if marketing notifications are added later, gate them behind explicit opt-in. |

## Feature Dependencies

```
Age gate (18+) + basic signup
    └──requires──> nothing (entry point)

Deposit via mobile money
    └──requires──> Wallet (available/locked balance model)

Create bet
    └──requires──> Wallet (available balance to lock)
    └──requires──> Match/fixture data (what to bet on, kickoff time for cancellation trigger)

Accept bet
    └──requires──> Create bet (must exist and be open)
    └──requires──> Wallet (opponent's available balance to lock)
    └──enhances-trust-via──> Same-device/IP fraud check (block/flag before allowing match)

Escrow (balance lock on both sides)
    └──requires──> Double-spend-safe balance transactions (row locking / versioning)

Automatic settlement
    └──requires──> Escrow (funds already locked)
    └──requires──> Official result feed (sports data API)
    └──requires──> Double-spend-safe balance transactions (payout must be atomic + idempotent)

Cancellation + refund (unmatched or voided bet)
    └──requires──> Escrow (something locked to release)
    └──requires──> Match kickoff time (trigger for "unmatched at kickoff" auto-cancel)

Notifications (matched / settled / refunded)
    └──requires──> Create bet, Accept bet, Settlement, Cancellation (each is a trigger event)

Transaction history
    └──requires──> Wallet ledger (every lock/release/payout/commission must be a recorded entry)

Withdrawal via mobile money
    └──requires──> Wallet (available balance to debit)
    └──requires──> Deposit (established mobile money identity/account link) — order not strict but usually built together

Admin panel (money visibility)
    └──requires──> Wallet, Transaction history, Bet lifecycle states (built on top of all core-loop data)

Order-book / partial-fill matching (deferred) ──conflicts──> Full-stake 1-for-1 matching (v1 model)
Multi-market types (deferred) ──enhances──> Create bet (adds prediction-type dimension) but not required for v1
Social layer / chat (deferred) ──enhances──> User profile, but independent of the money-moving core loop
```

### Dependency Notes

- **Create/Accept bet requires Wallet:** you cannot lock a stake that doesn't have a verified available balance — this is why wallet + deposit must ship before or alongside bet creation, not after.
- **Escrow requires double-spend-safe transactions:** this is the one feature that must be architected correctly from day one — retrofitting proper locking after a bug has caused overdrafts is far more expensive than building it right the first time. Treat this as a phase-0/foundation concern, not a later hardening pass.
- **Settlement requires the official result feed:** this is an external dependency the whole "automatic, trustworthy payout" promise rests on. Feed latency, wrong/ambiguous results, or postponed/abandoned matches all cascade into settlement logic — plan for a "pending/disputed" bet state, not just open/matched/settled.
- **Notifications are pure derivatives:** every notification type maps 1:1 to a state transition already required by the core loop (matched, settled, refunded) — there is no additional data model needed, only event hooks, so this is lower complexity than it might appear.
- **Order-book matching conflicts with the v1 full-stake model:** do not partially build toward an order book "just in case" — the founder's simpler model (opponent always takes the opposite side, full stake) removes an entire class of matching-engine and partial-settlement complexity that Sporttrade/Novig/Kalshi all have to solve. Keep them decoupled; a future pivot to order-book matching would be a rebuild, not an extension.

## MVP Definition

### Launch With (v1)

Minimum viable product — validates "can two strangers safely bet against each other and trust the payout."

- [ ] Signup/login with 18+ checkbox (no document KYC) — required gate, near-zero friction
- [ ] Wallet: available balance, locked balance, total balance — the trust foundation for everything else
- [ ] Deposit via mobile money (PaySuite/M-Pesa/e-Mola) — without this there's no money to bet with
- [ ] Withdrawal via mobile money — without this, winnings are trapped and trust collapses
- [ ] Full transaction history (deposits, locks, releases, payouts, commission, refunds) — required for user self-trust and dispute resolution
- [ ] Create bet (match, side, stake) in <30s — the core loop's entry point and stated UX bar
- [ ] Accept bet (opposite side, same stake) — the "peer" half of peer-to-peer
- [ ] Automatic balance lock on create + accept, using safe (non-race-prone) transactions — prevents insolvency from day one
- [ ] Automatic result lookup via sports-data API and automatic settlement (payout minus 10% commission) — the core value promise
- [ ] Automatic cancellation + refund if unmatched by kickoff — prevents "stuck money" complaints
- [ ] Manual cancel by creator while unmatched — basic expected control
- [ ] Notifications: matched, settled, refunded — closes the loop without requiring the user to poll the app
- [ ] Basic same-device/same-IP check blocking or flagging creator-vs-acceptor self-matches — closes the most obvious commission-arbitrage exploit inherent to the product's own mechanics
- [ ] Minimal user profile (username, avatar, bet count, win/loss, win rate) — required for "who is my opponent" and supports the founder's ranking idea cheaply
- [ ] Minimal admin visibility (users, wallets, bets by status, deposits/withdrawals log, total platform exposure) — operationally required to run a real-money product safely, even if not user-facing

### Add After Validation (v1.x)

Add once the core loop is proven reliable and trusted (real settlements happening correctly, real deposits/withdrawals clearing, no fraud/insolvency incidents).

- [ ] Fuller admin tooling — audit logs, denunciation/report handling, user blocking workflow — trigger: real fraud/abuse reports start arriving
- [ ] Expanded championship/match coverage within football — trigger: demand signal that current leagues (Moçambola + top 3 European) are too narrow
- [ ] Richer profile/ranking display (levels, more detailed stats) — trigger: users start asking "who's the best bettor" organically
- [ ] Improved fraud heuristics (velocity checks, multi-account patterns beyond device/IP) — trigger: basic device/IP check starts showing false negatives in practice

### Future Consideration (v2+)

Defer until product-market fit on the core loop is established — explicitly out of scope per PROJECT.md and confirmed against competitor patterns.

- [ ] Multi-market types (over/under, handicap, correct score, etc.) — why defer: multiplies settlement complexity and result-feed data needs before the single-market loop is proven
- [ ] Multi-sport support — why defer: each sport is a new result-feed integration and market-definition problem
- [ ] Social features: chat, leaderboards, groups/circles — why defer: solves an engagement problem the product doesn't have yet; introduces moderation/abuse surface prematurely
- [ ] Live/in-play betting and cash-out — why defer: requires real-time pricing and partial-position infrastructure fundamentally different from the pre-match full-stake model
- [ ] Order-book-style matching (partial fills, multiple counterparties) — why defer: solves a liquidity problem that only exists at much higher volume; conflicts architecturally with the simpler 1-for-1 model
- [ ] Full document-based KYC — why defer: regulatory/volume trigger not yet reached, and the founder has explicitly deferred it
- [ ] Advanced ML/behavioral collusion detection — why defer: needs a labeled fraud dataset that doesn't exist until the product has real usage history
- [ ] Multi-currency/multi-country expansion — why defer: explicitly out of scope in PROJECT.md; adds FX, compliance, and payment-rail complexity

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Wallet (available/locked/total) | HIGH | MEDIUM | P1 |
| Double-spend-safe balance transactions | HIGH (invisible but foundational) | HIGH | P1 |
| Deposit via mobile money | HIGH | MEDIUM | P1 |
| Withdrawal via mobile money | HIGH | MEDIUM | P1 |
| Create bet | HIGH | LOW | P1 |
| Accept bet | HIGH | MEDIUM | P1 |
| Automatic settlement via result feed | HIGH | HIGH | P1 |
| Auto-cancel + refund unmatched bets | HIGH | LOW-MEDIUM | P1 |
| Transaction history | HIGH | LOW-MEDIUM | P1 |
| Notifications (matched/settled/refunded) | HIGH | LOW | P1 |
| Same-device/IP self-bet check | MEDIUM-HIGH | MEDIUM | P1 |
| Minimal user profile + stats | MEDIUM | LOW | P1 |
| Minimal admin (money visibility) | MEDIUM (ops-critical) | MEDIUM-HIGH | P1 |
| Manual cancel while unmatched | MEDIUM | LOW | P1 |
| Fuller admin (audit, reports, blocking) | MEDIUM | MEDIUM | P2 |
| Richer profile/ranking | LOW-MEDIUM | LOW-MEDIUM | P2 |
| More leagues/championships | MEDIUM | LOW (per league) | P2 |
| Improved fraud heuristics | MEDIUM | MEDIUM | P2 |
| Multi-market types | MEDIUM | HIGH | P3 |
| Multi-sport | MEDIUM | HIGH | P3 |
| Social features (chat, leaderboards, groups) | LOW-MEDIUM | MEDIUM-HIGH | P3 |
| Live betting / cash-out | LOW (for this audience) | HIGH | P3 |
| Order-book matching | LOW (for this audience/scale) | HIGH | P3 |
| Full document KYC | LOW (v1), rises with regulation | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Sporttrade / Novig (US exchanges) | Kutt / BroThrow / WagerLab (friend-betting apps) | Duelo's Approach |
|---------|--------------------|--------------------|--------------------|
| Matching model | Order book, partial fills, market-maker fallback for illiquid markets | Direct 1:1 challenge, sometimes negotiated terms | Simple full-stake 1-for-1 match, opponent always takes the opposite side — no order book, no negotiation |
| Escrow | Exchange holds funds contractually/via custodial account until settlement | Pre-funded stakes (Kutt) so neither side can flake | Same principle (both stakes locked before match is live) but via internal wallet, not smart contracts |
| Commission model | Sporttrade ~2% of winnings; Novig 1-4% only when acting as market maker, otherwise 0% (no-vig) | Typically free or subscription-based, not commission-on-winnings | Flat 10% of pot on settlement — simpler but more aggressive than exchange peers; a deliberate founder choice to revisit if adoption suffers |
| Payment rails | Card/bank/ACH (US-centric) | Often settle via external payment apps (Venmo-style) manually | Mobile money (M-Pesa/e-Mola/mKesh) native and automatic — this is the actual point of differentiation vs. both competitor classes |
| Social layer | Minimal (Sporttrade is trading-UI focused) | Core hook: chat, groups, leaderboards, private circles | Deliberately deferred; only minimal profile/stats at v1 |
| Market breadth | Many markets (moneyline, spread, totals, futures), multi-sport | Bet on "anything" (sports, politics, pop culture) | Deliberately narrow: 1X2 only, football only, curated leagues only |
| KYC/verification | Full regulated KYC (licensed US operators) | Usually none/minimal (informal, often not real-money at scale) | Self-declared 18+ only for v1, full KYC deferred until regulation/volume requires it |

## Sources

- [How Does Sporttrade Work? | Betting Exchange Explained](https://bettingapps.com/articles/how-does-sporttrade-work)
- [Novig Sports Betting Exchange & Prediction Market Review](https://www.legalsportsreport.com/prediction-markets/novig-promo-code/)
- [Exchange vs Sportsbook (Novig blog)](https://novig.com/blog-posts/exchange-vs-sportsbook)
- [How Prediction Market Order Books Work on Kalshi and Polymarket](https://defirate.com/prediction-markets/how-order-books-work/)
- [How Kalshi and Polymarket Settle Event Contracts (and Disputes)](https://defirate.com/prediction-markets/how-contracts-settle/)
- [Kutt — Republic](https://republic.com/kutt) / [Kutt - The Social Betting Platform](https://www.kutt.com/)
- [BroThrow](https://brothrow.com/)
- [WagerLab - Friendly Betting App](https://www.wagerlab.app/)
- [youbetme — Bet on anything with friends](https://youbetme.com/)
- [Online Gambling and Betting Fraud in South Africa - Gripp Advisory](https://grippadvisory.co.za/2022/01/online-gambling-and-betting-fraud-in-south-africa-2/)
- [Online Gambling Fraud: What is It & How to Prevent It | SEON](https://seon.io/resources/online-gambling-fraud/)
- [All-In one Fraud Prevention | TransUnion Africa](https://www.transunionafrica.com/blog/all-in-one-fraud-prevention)
- [Understanding Balances in Ledgers | Blnk Finance Blog](https://www.blnkfinance.com/blog/understanding-balances-in-ledgers)
- [Ledger balance: definition, architecture, and fintech use | Formance](https://www.formance.com/blog/financial-operations/ledger-balance-for-product-and-engineering)
- [Identity Verification (KYC) in 2026: The Move to Document-Free Onboarding](https://www.tonyspicks.com/2026/04/27/identity-verification-kyc-in-2026-the-move-to-document-free-onboarding/)
- [9 Sports Betting Apps That Don't Require ID/SSN](https://software.sports-arbitrage.com/without-hard-kyc-verification/)
- [The Role of Push Notifications in User Retention for Gambling Apps - SDLC Corp](https://sdlccorp.com/post/the-role-of-push-notifications-in-user-retention-for-gambling-apps/)
- [Push Notifications, High Stakes: Report slams sports betting ad tactics](https://www.consumeraffairs.com/news/push-notifications-high-stakes-report-slams-sports-betting-ad-tactics-080425.html)
- [Solving the Double Spend: System Design Patterns for Bulletproof Fintech | Medium](https://medium.com/codetodeploy/solving-the-double-spend-system-design-patterns-for-bulletproof-fintech-ee5d73f33415)
- [Webhooks in Banking and Fintech: The Shift to Event-Driven Architecture](https://sdk.finance/blog/webhooks-in-banking-and-fintech-the-shift-to-event-driven-architecture/)
- `.planning/PROJECT.md` (project requirements, founder decisions, and scope constraints)

---
*Feature research for: P2P sports betting platform (Duelo)*
*Researched: 2026-07-09*
