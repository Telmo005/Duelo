# Roadmap: Duelo

## Overview

Duelo is a peer-to-peer sports-betting wallet: two users stake against each other on a
1X2 football outcome, the platform holds both stakes in escrow, and the winner is settled
automatically after the official result — the platform never takes a side. The roadmap is
built money-first, then the bet loop, then automatic settlement, deliberately front-loading a
working, beautiful core loop (fund -> create -> match -> settle) as early as possible.

Phase 1 establishes the financial-correctness bedrock (append-only double-entry ledger plus
row-locked, idempotent balance mutations) while delivering a genuinely usable "fund my wallet"
slice. Phase 2 adds the peer bet loop with two-sided escrow. Phase 3 closes the loop with
automatic result-driven settlement, commission, edge-case refunds, and notifications. Phase 4
lets users cash out winnings and see their track record. Phase 5 gives operators the
money-visibility and fraud-review surface needed to run real money safely.

Design polish and mobile-first UX are treated as first-class in every UI-bearing phase, not a
late cosmetic pass. Moçambola coverage is deferred (its sports-data source is unconfirmed) —
settlement scopes strictly to European leagues confirmed by the API. A non-engineering parallel
track (IGJ sports-betting licensing, per Mozambique Law 1/2010) must run alongside this roadmap
before any real-money launch; it is out of engineering scope here but flagged so it is not
forgotten.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Identity & Funded Wallet** - Register, log in, and deposit via mobile money onto a correct, auditable ledger
- [ ] **Phase 2: Peer Bet Loop (Escrow)** - Create, match, and cancel 1X2 bets with both stakes locked in escrow
- [ ] **Phase 3: Automatic Settlement & Payout** - Fetch official results and pay the winner automatically, with notifications
- [ ] **Phase 4: Cash Out & Player Profile** - Withdraw winnings to mobile money and view player stats
- [ ] **Phase 5: Admin & Fraud Controls** - Back-office money visibility and same-device/IP fraud review

## Phase Details

### Phase 1: Identity & Funded Wallet
**Goal**: A new user can register (18+), stay logged in, deposit MT via mobile money, and see their money on a correct, fully auditable ledger — the financial bedrock the whole product rests on.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, WALLET-01, WALLET-02, WALLET-03, WALLET-04, PAY-01, PAY-02, PAY-03, DESIGN-01
**Success Criteria** (what must be TRUE):
  1. A new user can register with phone (or email) and password, confirm they are 18+, stay logged in across visits, and reset a forgotten password.
  2. A logged-in user can deposit MT via M-Pesa or e-Mola and, once PaySuite confirms, sees their available balance increase.
  3. The wallet screen shows available, locked, and total balance as distinct values, plus a full transaction history where every entry has a reason (deposit, lock, release, payout, commission, refund).
  4. Every balance change is an atomic, append-only ledger entry — a duplicated or replayed PaySuite deposit webhook (signature-verified) credits the wallet exactly once, with no direct balance mutation.
  5. The interface presents Duelo's own visual identity (color, typography, micro-interactions) and renders cleanly on a low-end mobile device.
**Plans**: 4 plans
- [ ] 01-01-PLAN.md — Walking skeleton: Next.js scaffold + Duelo design system + register/login/session + deployed (AUTH-01/02/03, DESIGN-01)
- [ ] 01-02-PLAN.md — Wallet foundation: append-only ledger + row-locked atomic credit/hold/release (concurrency-tested) + wallet screen (WALLET-01/02/03)
- [ ] 01-03-PLAN.md — Deposit slice: M-Pesa/e-Mola via PaySuite, signed idempotent webhook, transaction history (PAY-01/02/03, WALLET-04)
- [ ] 01-04-PLAN.md — Password reset: enumeration-safe recover → email link → set new password (AUTH-04)
**UI hint**: yes

### Phase 2: Peer Bet Loop (Escrow)
**Goal**: Two different users can stake against each other on a real fixture with both stakes locked in escrow, and unmatched bets resolve safely — the peer-to-peer core of the product.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: BET-01, BET-02, BET-03, BET-04, BET-05, BET-06, BET-07, DESIGN-02
**Success Criteria** (what must be TRUE):
  1. A user can browse upcoming fixtures (European leagues; Moçambola deferred) and create a 1X2 bet — choosing prediction and stake — in under 30 seconds on mobile, which immediately moves their stake from available to locked.
  2. A second, different user can accept an open bet, automatically taking the opposite prediction for the exact same stake, which locks their balance and marks the bet matched.
  3. The creator can manually cancel a bet while it is still unmatched, and the locked stake returns to available.
  4. A bet that finds no opponent before kickoff is automatically cancelled and the creator's stake refunded.
  5. Device fingerprint and IP are captured on both creation and acceptance (feeding later fraud review), and the same funds cannot be locked twice via concurrent bets.
**Plans**: TBD
**UI hint**: yes

### Phase 3: Automatic Settlement & Payout
**Goal**: A matched bet resolves itself after the match — the official result is fetched automatically, the winner is paid the pot minus commission, edge cases refund cleanly, and both users are notified.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: SETL-01, SETL-02, SETL-03, SETL-04, PROF-02
**Success Criteria** (what must be TRUE):
  1. After a matched bet's fixture reaches full-time, the official 1X2 result is fetched automatically from the sports-data API (European leagues) with no manual entry.
  2. The winner automatically receives the pot minus a 10% platform commission in their available balance, and settlement runs exactly once per fixture even if the result is polled repeatedly.
  3. A postponed, abandoned, or result-less fixture (beyond the tolerance window) refunds both stakes in full with no commission charged.
  4. Both users receive a notification when their bet is accepted, when it is cancelled/refunded, and when it is settled (win or loss, with the amount and new balance).
**Plans**: TBD
**UI hint**: yes

### Phase 4: Cash Out & Player Profile
**Goal**: A user can get their money back out of the platform and see who they are as a player — closing the trust loop that a P2P money product depends on.
**Mode:** mvp
**Depends on**: Phase 1 (wallet balance to withdraw); Phase 3 (settled results populate winnings and stats)
**Requirements**: PAY-04, PROF-01
**Success Criteria** (what must be TRUE):
  1. A user can request a withdrawal of their available balance to mobile money; the funds are held immediately (preventing double-withdrawal) and paid out via PaySuite, with automatic reversal back to available balance if the payout fails.
  2. A completed withdrawal appears in the user's transaction history as an auditable ledger entry.
  3. Every user has a profile showing name, username, and basic stats (total bets, wins, losses) that update as bets settle, visible to themselves and to opponents.
**Plans**: TBD
**UI hint**: yes

### Phase 5: Admin & Fraud Controls
**Goal**: An operator can see all money movement at a glance and review suspicious self-matched bets — the minimum back-office needed to run real money safely.
**Mode:** mvp
**Depends on**: Phase 3 (complete money lifecycle to monitor); Phase 2 (device/IP data for fraud flags)
**Requirements**: ADMIN-01, ADMIN-02
**Success Criteria** (what must be TRUE):
  1. An admin can view all users, wallet balances, deposits, withdrawals, and bets by status, plus total platform exposure (the sum of all locked balances), through a read-only back-office surface.
  2. Bets where the creator and acceptor share a device fingerprint or IP are automatically flagged into an admin review queue for inspection before payout.
  3. Every admin figure reads from the same auditable ledger and reconciles against the deposit/withdrawal/settlement history.
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Identity & Funded Wallet | 0/4 | Not started | - |
| 2. Peer Bet Loop (Escrow) | 0/TBD | Not started | - |
| 3. Automatic Settlement & Payout | 0/TBD | Not started | - |
| 4. Cash Out & Player Profile | 0/TBD | Not started | - |
| 5. Admin & Fraud Controls | 0/TBD | Not started | - |
