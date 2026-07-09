# Research Synthesis: Duelo P2P Sports Betting Platform

**Date:** 2026-07-09
**Platform:** Mozambique-focused, mobile-money native
**Synthesized from:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md

---

## Executive Summary

Duelo is a P2P sports betting platform with an unusually tight, defensible core: peer-matched stakes held in escrow, automatic settlement via sports-data APIs, and immediate payout via mobile money (M-Pesa, e-Mola, mKesh). The product's strategy hinges on three differentiators: (1) zero-house-edge fairness (1:1 matched bets, no order book), (2) mobile-money-native payment flows that traditional exchanges ignore, and (3) sub-30-second bet creation UX.

**Recommended approach:** Build as a monolithic Next.js web app (not native mobile) backed by PostgreSQL and Supabase, with a meticulously correct wallet/ledger foundation using explicit row-locking to prevent double-spend. The architecture is not novel—it mirrors fintech payment platforms and prediction markets—but the implementation is unforgiving: even one race condition on the ledger or one non-idempotent webhook handler will corrupt funds. The MVP scope is tightly defined (1X2 football only, three curated leagues initially, flat 10% commission) and feature-complete by design. The single biggest execution risk is regulatory—Mozambique's Sports Betting License is required and currently unconfirmed in engagement; this must be a parallel non-engineering track from day one.

**Key dependencies:** PaySuite API sandbox access and direct confirmation of Moçambola coverage from sports-data vendors (API-Football/Sportmonks) are both blockers for detailed planning. Supply these before phase planning begins.

---

## Key Findings

### From STACK.md

**Recommended core technologies:**
- **Framework:** Next.js 16.2.x App Router with React 19, TypeScript 5, Node.js 24 LTS
  - One deployable app, Server Components reduce client JS for low-end Android
- **Database:** PostgreSQL 17/18 via Supabase + Drizzle ORM
  - ACID + row-level locking are the mechanism preventing double-spend
  - Pattern: Stored procedures (PL/pgSQL) for wallet mutations; SELECT FOR UPDATE mandatory
- **Payments:** PaySuite REST API v1 (M-Pesa/e-Mola/mKesh)
  - Confidence: MEDIUM-LOW (single-source docs, unverified)
  - Webhook HMAC-SHA256 verification + idempotency tracking mandatory
  - Reconciliation job (BullMQ + Redis) as belt-and-suspenders
- **Sports data:** API-Football Pro (~$19/mo) for European leagues; Moçambola coverage UNCONFIRMED
- **Realtime:** Supabase Broadcast + refetch-on-focus fallback
- **Stack:** Tailwind CSS v4, shadcn/ui, Motion, TanStack Query, Zod, Vitest + Playwright

**Confidence: MEDIUM (HIGH on frontend/DB patterns; LOW on Moçambola sports-data)**


