<!-- GSD:project-start source:PROJECT.md -->

## Project

**Duelo**

Duelo é uma plataforma de apostas desportivas P2P (peer-to-peer) onde utilizadores apostam uns contra os outros — nunca contra a casa. Um utilizador cria uma aposta sobre um evento desportivo (partida de futebol) prevendo um resultado (vitória da casa / empate / vitória do visitante) e define um valor. Outro utilizador aceita, apostando exatamente contra essa previsão pelo mesmo valor. A plataforma bloqueia o dinheiro de ambos, aguarda o resultado oficial (via API de dados desportivos), e paga automaticamente ao vencedor o pote total menos a comissão da plataforma. A plataforma atua apenas como intermediária/custodiante — nunca assume risco financeiro nem participa como contraparte.

**Core Value:** Dois utilizadores conseguem apostar um contra o outro, com o dinheiro de ambos protegido em custódia e a liquidação do vencedor totalmente automática e confiável após o resultado oficial — sem que a plataforma corra qualquer risco financeiro.

### Constraints

- **Mercado geográfico**: Moçambique apenas no v1 — pagamentos via mobile money local (M-Pesa/e-Mola/mKesh)
- **Moeda**: MT (Metical) apenas no v1
- **Desporto**: Futebol apenas no v1 — Moçambola + Premier League, La Liga, Champions League
- **Resultado oficial**: Dependência de API externa de dados desportivos (custo recorrente e disponibilidade/latência dos dados são um risco a mitigar)
- **Segurança financeira**: Toda movimentação de saldo deve ser transacional e auditável — nenhuma condição de corrida pode permitir dupla utilização do mesmo saldo bloqueado
- **Idade mínima**: 18+ obrigatório (checkbox de confirmação no registo, sem verificação documental no MVP)
- **Comissão**: 10% do pote, cobrada ao vencedor na liquidação

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js (App Router) | 16.2.x (LTS line) | Full-stack React framework — pages, forms, API/route handlers, PWA shell | One deployable app instead of separate SPA + API server. Server Components keep client JS small (server renders most of the UI, only interactive fragments — bet creation form, wallet actions — ship as client bundles), which matters directly for the "low-end Android, variable network" constraint. Route handlers give you a place to receive PaySuite webhooks and do server-only Postgres transaction work without provisioning a second service for MVP. |
| React | 19.x (bundled with Next 16) | UI library | Required by Next.js; mature ecosystem for the animation/component layer below. |
| TypeScript | 5.x | Language | Non-negotiable for a ledger/wallet system — compile-time safety on money math, transaction shapes, and API contracts. |
| Node.js | 24.x (Active LTS) | Runtime | Current Active LTS as of mid-2026 (Node 22 is Maintenance LTS, Node 26 is Current-not-yet-LTS). Use 24 for the deployed runtime; avoid 26 until it hits LTS in Oct 2026. |

### Database & Wallet Correctness

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PostgreSQL | 17 or 18 (managed) | System of record — wallet balances, bets, ledger, audit trail | ACID transactions + row-level locking are the actual mechanism that prevents the "double-spend of locked balance" failure mode this project is built around. This is not a place to reach for a NoSQL or eventually-consistent store. PG18 is current stable (18.4); PG17 is still fully supported if your host doesn't offer 18 yet — either is fine. |
| Supabase (managed Postgres + Auth + Realtime + Storage) | Platform (current) | BaaS wrapper around Postgres | Gives a solo/small team managed Postgres, phone-based auth, realtime channels, file storage (profile photos), and an admin-queryable Postgres instance — all Postgres underneath, so nothing is proprietary lock-in; you can self-host Postgres later if you outgrow it. This is the pragmatic "start basic but correct" choice vs. hand-rolling Auth + a separate realtime service + a separate object store. |
| Postgres stored procedures (PL/pgSQL, `SECURITY DEFINER`) for wallet mutations | — | The actual balance-locking mechanism | **Critical pattern, not optional:** `supabase-js` talks to Postgres through PostgREST, which does not support multi-statement client-side transactions. Every operation that touches a balance (lock on bet creation, lock on bet acceptance, settlement payout, refund) must be a single Postgres function invoked via `.rpc()`, and that function must open an explicit transaction and take a row lock (`SELECT ... FOR UPDATE`) on the wallet row(s) before reading/writing balance. This is the standard fix for the classic "two concurrent reads both see balance=1000, both decrement, final balance is wrong" race condition. Keep lock acquisition order consistent across all functions (e.g., always lock the lower user_id first) to avoid deadlocks between concurrent bet-accept operations. |
| `wallet_ledger` double-entry table + cached `balance` column | — | Auditability requirement | The project explicitly requires "auditoria e rastreabilidade completa." Don't just mutate a `balance` integer — write one immutable ledger row per movement (deposit, lock, unlock, payout, commission, refund) with running balance, and treat the `balance` column as a derived cache updated in the same transaction. This gives you a free audit log and makes reconciliation against PaySuite payouts trivial. |
| Drizzle ORM | drizzle-orm ^0.4x (1.0 release candidates exist but stay on stable 0.x until 1.0 is finalized) | Schema definition, migrations, typed queries for non-transactional reads | Drizzle stays close to raw SQL (code-first, no black-box query engine), has a tiny bundle (~tens of KB vs Prisma's historically much larger engine) and is edge/serverless-native — good fit next to Next.js on Vercel. Critically: keep Drizzle for schema/migrations and simple typed reads, but write the actual money-moving logic as Postgres functions called via RPC (see above) — don't rely on an ORM's application-level transaction wrapper for the locking-sensitive path. |

### Payments (PaySuite)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PaySuite REST API | v1 (`api.paysuite.tech/api/v1` per public docs at paysuite.tech/docs) | Mobile money collections (deposits) and payouts (withdrawals) via M-Pesa, e-Mola, mKesh, cards | Only mobile money aggregator with public API docs and Mozambique-specific mobile money coverage found in research. Confidence flagged MEDIUM/LOW below — verify against a live sandbox account before committing scope, since this was fetched from a single source. |
| Bearer token auth (`Authorization: Bearer {key}`) | — | Auth to PaySuite API | Standard pattern per PaySuite docs; store the key server-side only (route handler / server action), never client-exposed. |
| Webhook receiver (Next.js route handler) + HMAC-SHA256 signature verification | — | Payment confirmation | PaySuite posts `payment.success` / `payment.failed` events to your `callback_url` with an `X-Webhook-Signature` header (HMAC-SHA256 over the raw body using your webhook secret). **Do not trust webhooks unsigned** — verify with `crypto.timingSafeEqual` before processing, and treat `request_id`/your own `reference` as an idempotency key (store processed request IDs so a retried webhook — PaySuite retries failed deliveries up to 5x with backoff — can't double-credit a deposit). Respond 200 within ~5s (ack fast, do the wallet-crediting DB transaction asynchronously if it risks running long). |
| Reconciliation job (poll `GET /payments/{id}` / `GET /payouts/{id}`) | — | Safety net against missed webhooks | Webhooks can be lost even with retries (network partition, deploy downtime). Run a periodic job (BullMQ, see below) that reconciles any deposit/payout still "pending" after N minutes by polling PaySuite's GET endpoints directly — this is the standard belt-and-suspenders pattern for every mobile money integration in this market, not PaySuite-specific. |

### Sports Data (Match Results for Auto-Settlement)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| API-Football (api-sports.io / RapidAPI) | Pro tier (~$19/mo entry) | Official results for Premier League, La Liga, Champions League | Cheapest production-grade entry point found, broad claimed coverage (1,200+ leagues/cups), live status updates during matches — good fit for the three named European competitions. |
| **Open gap: Moçambola coverage is unconfirmed** | — | Official results for the Mozambican league | None of the mainstream football-data APIs (API-Football, Sportmonks, football-data.org) explicitly confirmed Moçambola coverage in this research pass — only fan-facing score sites (Sofascore, Flashscore, BetExplorer) and FootyStats (which does advertise a JSON API) show Moçambola data. **Action before roadmap locks scope:** contact API-Football/Sportmonks support directly to confirm Moçambola fixture+result coverage, or pilot FootyStats' API for Moçambola specifically. If no vendor covers it reliably, the "automatic settlement, no manual admin entry" requirement is at risk for the Moçambola market specifically and needs a fallback plan (e.g., admin-verified result entry as a stopgap for Moçambola only, with alerting if the automated feed doesn't return a result within X hours of kickoff). |

### Realtime ("Bet Accepted" Notifications)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Supabase Realtime — Broadcast channels | Platform (current) | Push "your bet was accepted" / "bet cancelled" / "settled" events to the client | Already bundled with the Supabase you're using for DB/Auth — no extra infra or vendor. Use **Broadcast**, not "Postgres Changes": Broadcast is a direct, server-mediated message (<50ms typical) that you emit explicitly *after* your wallet transaction commits, so the client never sees a partial/inconsistent state. Postgres Changes (logical replication based, 50-200ms) would fire the moment a row changes — before you're sure the paired wallet-lock updates in the same transaction have all landed — which is the wrong signal for a financial event. |
| Fallback: refetch-on-focus / short poll | — | Resilience for flaky mobile networks | Given "variable network conditions," don't make the UI *depend* on the websocket connection staying alive — pair Realtime with a refetch (TanStack Query `refetchOnWindowFocus`/`refetchOnReconnect`) so a dropped connection on a low-end device doesn't leave the user staring at stale state. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Tailwind CSS | 4.3.x | Utility CSS, design tokens | v4's Oxide (Rust) engine is dramatically faster to build; native OKLCH color pipeline gives smoother color transitions for a "beautiful, modern" UI without hand-tuned CSS. Zero runtime cost — ships no JS, which matters for low-end Android. |
| shadcn/ui | current CLI | Copy-in, ownable component primitives (buttons, dialogs, forms, cards) | Not an npm dependency you version-lock — components are generated into your repo via CLI and you own/customize the code. This is the standard 2025/2026 way to get a polished, consistent, accessible component set cheaply without buying into a heavy design-system runtime. Pairs directly with Tailwind. |
| Motion (`motion` package — formerly Framer Motion) | current | Micro-interactions, transitions (bet card flip, balance update, confetti-style win state) | The package was renamed from `framer-motion` to `motion` for new projects. Use it *only* for animations Tailwind's CSS transitions/animations can't express (spring physics, gesture-driven drag, orchestrated sequences); use plain Tailwind transitions for hovers/fades/loading states — keeps client JS lighter, which matters for the target devices. |
| TanStack Query (React Query) | v5 | Client-side data fetching/caching/refetch | Handles the "stale after reconnect", loading/error states, and optimistic-update patterns (e.g., show bet as "pending accept" instantly) needed for a snappy feel over shaky mobile connections. |
| Zod | v3/v4 | Runtime schema validation | Validate bet amounts, phone numbers, webhook payloads server-side — critical on any endpoint that moves money. Share schemas between client form validation and server route handlers. |
| BullMQ + Redis | current | Background jobs: settlement polling, PaySuite reconciliation, "no opponent before kickoff → auto-refund" | You need a reliable delayed/scheduled job runner for: (1) polling the sports-data API near kickoff/full-time to trigger settlement, (2) reconciling any payment left "pending," (3) the timed auto-cancel-and-refund rule. BullMQ is the standard Node choice; needs a small managed Redis (Upstash works well on a serverless/Vercel deployment). |
| Supabase Auth (phone OTP) + custom SMS provider via Send SMS Hook | Platform (current) | Registration/login by phone number (matches how users already think about mobile money) | Supabase's natively supported SMS providers (Twilio, MessageBird, Vonage) have inconsistent Mozambique deliverability/pricing; use the Send SMS Hook to route OTPs through an Africa-focused aggregator (e.g., Africa's Talking, which lists Mozambique as a supported market) instead. Verify actual MZ deliverability/pricing with the vendor before committing — this is a MEDIUM-confidence recommendation, not verified end-to-end. |
| Vitest + Playwright | current | Unit/integration + E2E testing | Vitest for ledger/locking logic (this is exactly the kind of code that needs concurrency tests simulating simultaneous bet-accept requests); Playwright for the bet-creation-in-under-30-seconds flow on a throttled mobile viewport. |

## Installation

# Core app

# Database / ORM

# Supabase

# UI layer

# Data fetching / validation

# Background jobs

# Dev dependencies

## Alternatives Considered

| Category | Recommended | Alternative | Why Not (for MVP) |
|----------|-------------|-------------|--------------------|
| App shape | Next.js PWA (installable web app) | Native mobile (React Native / Flutter) | Founder explicitly wants "start basic but beautiful," fast to ship. Native adds app-store review cycles, two extra build targets, and doesn't fix the actual bottleneck (financial correctness + payment integration). Flutter's Impeller engine gives smoother animation on low-end Android than RN's bridge, and RN gives more code-sharing with a future native app — but revisit either only after PMF, when push notifications or deeper device integration (biometric wallet unlock, etc.) justify the cost. |
| Frontend framework | Next.js (App Router) | Vite + plain React SPA | Vite ships a smaller client bundle (~42KB vs ~92KB baseline) and is genuinely the lighter choice for pure client-side PWAs. But choosing it means standing up and hosting a *separate* backend (Express/Fastify) for the API, webhook receiver, and background jobs — doubling infra surface for a solo/small team MVP. Next.js Server Components claw back most of the bundle-size gap when you keep client components scoped to genuinely interactive UI (bet form, wallet screen), so the net mobile-performance difference is small in practice while the infra savings are large. |
| Backend/DB | Supabase (managed Postgres + Auth + Realtime) | Self-managed Postgres (Neon/Railway/RDS) + custom Express API + custom Auth + Pusher/Socket.io for realtime | More control and no vendor platform risk, but means building and operating auth, realtime infra, and file storage yourself — significant extra work for a team trying to ship an MVP fast. Postgres underneath is identical either way, so this is a "buy vs. build the surrounding plumbing" decision, not a database decision. Reconsider self-hosting once you outgrow Supabase's free/pro tiers or need a region Supabase doesn't offer (see gap below). |
| ORM | Drizzle | Prisma | Prisma 7 (late 2025) replaced its Rust engine with a ~600KB gzipped TS/WASM engine and closed most of the cold-start gap, so it's a reasonable choice too. Drizzle is preferred here specifically because ledger code benefits from staying close to raw SQL (`SELECT ... FOR UPDATE`, explicit transactions) rather than being abstracted by an ORM's transaction API — less risk of the ORM doing something you didn't intend with a lock. |
| Realtime | Supabase Realtime (Broadcast) | Pusher / Socket.io / raw WebSockets | Pusher is a fine, boring, reliable managed alternative if you weren't already paying for Supabase — but since Supabase is already the DB/Auth provider, adding a second realtime vendor is unnecessary cost and surface area. Socket.io/raw WebSockets require you to build and scale your own connection/pub-sub infrastructure (Redis adapter, horizontal scaling) — not worth it pre-PMF. |
| Sports data | API-Football (Pro) for European leagues | Sportmonks | Sportmonks' Starter tier (€29/mo) only includes 5 leagues total, and you need at least 4 (Premier League, La Liga, Champions League, Moçambola-if-covered) — you'd likely need their Growth tier (€99/mo) to have headroom, vs. API-Football Pro at ~$19/mo. Sportmonks may still be worth revisiting if API-Football's data quality/latency proves insufficient in practice. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| Reading balance in application code, then writing new balance in a separate query/statement (read-then-write without a lock) | This is the exact race condition that causes double-spend of a locked balance — two concurrent requests can both read the same starting balance and both "succeed," corrupting the ledger. This is the single most important thing to get right in this entire stack. | `SELECT ... FOR UPDATE` inside a Postgres function/transaction for every balance-mutating operation (bet lock, bet accept, settlement, refund). |
| Relying on `postgres_changes` (Realtime) as the source of truth for "was this financial operation actually complete" | Fires on row-level replication as soon as any row changes — before a multi-table transaction (wallet + bet + ledger) is guaranteed fully consistent from the client's perspective, and it's a DB-internal signal, not an app-level event. | Explicit `Broadcast` message emitted by your server *after* the transaction commits. |
| Processing PaySuite (or any mobile money) webhooks without signature verification or idempotency tracking | Unsigned/unverified webhooks can be spoofed to fake a deposit; un-deduplicated retries (PaySuite retries up to 5x) can double-credit a wallet. | Verify `X-Webhook-Signature` (HMAC-SHA256) and store processed `request_id`/`reference` values before crediting anything. |
| Native mobile app (React Native/Flutter) as the v1 build target | Contradicts "start basic," adds app-store review latency and two build pipelines, before the core financial/matching logic is even validated. | Installable PWA (Next.js + manifest + service worker), revisit native after PMF. |
| Prisma's older Rust-engine versions (pre-7) on a serverless/edge deployment | The old ~14MB Rust binary caused slow cold starts on serverless functions — a real problem if deploying route handlers to Vercel functions. | Drizzle (recommended), or Prisma 7+ if you prefer its DX and accept the (now much smaller) engine. |

## Stack Patterns by Variant

- Use FootyStats' API (confirmed to offer Mozambique/Moçambola JSON data in this research) as a Moçambola-specific secondary source, feeding the same internal "match result" table your settlement job reads from — keep the settlement logic source-agnostic (it reads your own `matches` table, not the vendor API directly) so swapping/adding a provider per-league doesn't touch settlement code.
- If no automated source proves reliable for Moçambola within the MVP timeline, add an admin-verification fallback specifically for that league (with alerting), rather than blocking the whole product on this one open integration gap.
- Supabase does not currently offer a South Africa/Cape Town region for new projects (community-requested, not yet available as of this research) — your nearest managed region will likely be in Europe, adding latency for Mozambican users on every DB round-trip. For a P2P betting app (not a low-latency trading app), this is an acceptable trade-off at MVP scale; revisit with a self-hosted Postgres in a closer region (or wait for Supabase to add one) only if user-perceived latency becomes a measured problem.
- Since the schema lives in plain Postgres via Drizzle migrations, moving to self-hosted Postgres later is a lift-and-shift, not a rewrite.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| Next.js 16.x | React 19.x, Node 20.9+/22+/24 | Next 16 requires a current Node LTS; don't pair with Node 18 (EOL). |
| Tailwind CSS v4.x | PostCSS-free (Oxide/Lightning CSS engine) | v4 is a from-scratch rewrite vs v3 — do not follow v3-era config tutorials; config format changed (CSS-first `@theme` config instead of `tailwind.config.js` for most cases). |
| Drizzle ORM (0.4x stable) | PostgreSQL 14–18, `postgres` / `pg` drivers, Supabase connection strings | Works against Supabase's connection pooler (Supavisor) in transaction mode for serverless deploys — use the *session* pooler mode specifically for any code path that needs multi-statement transactions outside of RPC functions. |
| Supabase Realtime Broadcast | Any Supabase project tier | Pro tier default caps ~500 concurrent realtime connections — fine for MVP scale; monitor and upgrade if concurrent online users approach that ceiling. |
| BullMQ | Redis 6.2+ | Use a managed Redis (e.g., Upstash) if deploying serverless — BullMQ needs a persistent Redis connection, which plain Vercel functions don't provide natively. |

## Sources

- [Vite vs Next.js 2025/2026 comparisons — designrevision.com, strapi.io, rollbar.com](https://designrevision.com/blog/vite-vs-nextjs) — bundle size/TTI figures — WEB, LOW/MEDIUM confidence (aggregated blog consensus, not benchmarked first-hand)
- [Tailwind CSS v4 announcement — tailwindcss.com/blog/tailwindcss-v4](https://tailwindcss.com/blog/tailwindcss-v4) — official, HIGH confidence
- [Tailwind CSS npm package — npmjs.com/package/tailwindcss](https://www.npmjs.com/package/tailwindcss) — version verification, HIGH confidence
- [Tailwind + shadcn/ui + Motion "indie SaaS stack" — buildmvpfast.com](https://www.buildmvpfast.com/blog/tailwind-framer-motion-shadcn-ui-indie-saas-design-stack-2026) — WEB, MEDIUM confidence
- [PostgreSQL explicit locking docs — postgresql.org/docs/current/explicit-locking.html](https://www.postgresql.org/docs/current/explicit-locking.html) — official, HIGH confidence
- [Ledger/locking pattern discussion — martinrichards.me, moderntreasury.com, freecodecamp.org, dev.to](https://www.martinrichards.me/post/ledger_p1_optimistic_locking_real_time_ledger/) — WEB, MEDIUM confidence (converges across multiple independent write-ups)
- [Supabase RLS + transactions for fintech — supabase.com/docs](https://supabase.com/docs/guides/database/postgres/row-level-security) and [supabase.com/features/row-level-security](https://supabase.com/features/row-level-security) — official, HIGH confidence
- [Supabase transactions/RLS in Edge Functions — marmelab.com](https://marmelab.com/blog/2025/12/08/supabase-edge-function-transaction-rls.html) — WEB, MEDIUM confidence — confirms PostgREST's lack of client-side transaction support, hence the RPC-function pattern
- [PaySuite official site — paysuite.co.mz/en](https://paysuite.co.mz/en/) — official, MEDIUM confidence (primary source, but single-fetch, not independently cross-verified against a second technical source)
- [PaySuite developer docs — paysuite.tech/docs](https://paysuite.tech/docs) — official, MEDIUM confidence — same caveat; **recommend verifying directly with a sandbox account before roadmap locks in exact endpoint names**
- [PaySuite WooCommerce plugin — wordpress.org/plugins/paysuite-payment-gateway-for-woocommerce](https://wordpress.org/plugins/paysuite-payment-gateway-for-woocommerce/) — corroborates payment methods (M-Pesa/e-Mola/mKesh/card) and "new payments api" existence, but not webhook/signature specifics
- [Mozambique mobile wallet interoperability — Banco de Moçambique](https://www.bancomoc.mz/en/media/highlights/interoperability-between-the-three-mobile-wallets-m-pesa-mkesh-and-e-mola/) — official regulator source, HIGH confidence (context only, not API-specific)
- [Football data API comparisons — thestatsapi.com, sportmonks.com/football-api/alternatives](https://www.thestatsapi.com/blog/best-football-api) — WEB, MEDIUM confidence — pricing figures should be re-verified at purchase time
- [Moçambola coverage sources — Sofascore, Flashscore, BetExplorer, FootyStats](https://www.sofascore.com/tournament/football/mozambique/mocambola/16642) — WEB, LOW confidence for API-suitability (these are consumer score sites, not confirmed developer API coverage — FootyStats is the only one advertising an API)
- [Socket.IO vs Supabase Realtime — ably.com/compare/socketio-vs-supabase](https://ably.com/compare/socketio-vs-supabase) and [Supabase Realtime docs — supabase.com/docs/guides/realtime](https://supabase.com/docs/guides/realtime/broadcast) — WEB + official, MEDIUM-HIGH confidence
- [Drizzle vs Prisma 2026 comparisons — makerkit.dev, bytebase.com, encore.dev](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma) — WEB, MEDIUM confidence
- [Drizzle ORM npm — npmjs.com/package/drizzle-orm](https://www.npmjs.com/package/drizzle-orm) — version verification, HIGH confidence
- [Next.js blog/releases — nextjs.org/blog, github.com/vercel/next.js/releases](https://nextjs.org/blog/next-16-2) — official, HIGH confidence
- [Node.js release schedule — nodejs.org/en/blog](https://nodejs.org/en/blog/release/v26.0.0/) — official, HIGH confidence
- [PostgreSQL release notes — postgresql.org/about/news](https://www.postgresql.org/about/news/postgresql-184-1710-1614-1518-and-1423-released-3297/) — official, HIGH confidence
- [Supabase Auth phone/SMS hook docs — supabase.com/docs/guides/auth/auth-hooks/send-sms-hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook) — official, HIGH confidence
- [Supabase regions discussion (no South Africa region) — github.com/orgs/supabase/discussions/34614](https://github.com/orgs/supabase/discussions/34614) — community/WEB, MEDIUM confidence
- [Africa's Talking — africastalking.com](https://africastalking.com/) — official vendor site, MEDIUM confidence (Mozambique listed as supported; OTP-specific deliverability not independently verified)
- [BullMQ docs — bullmq.io, docs.bullmq.io](https://bullmq.io/) — official, HIGH confidence
- [PWA vs React Native vs Flutter for low-bandwidth — dev.to, pixelplex.io](https://dev.to/sajan_kumarsingh_b556129/cross-platform-mobile-development-react-native-vs-flutter-vs-progressive-web-apps-in-2025-50am) — WEB, MEDIUM confidence

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## Workflow

GSD workflow is disabled for this project (too token-expensive for this team's preference). Work directly with Edit/Write/Bash — no need to route through GSD skills or subagents for day-to-day changes. Use judgment and confirm with the user for larger decisions instead of formal planning docs.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
