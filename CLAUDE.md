# CLAUDE.md — OSPOS Onboarding

## What is OSPOS?

A free, open-source point of sale app that runs on any smartphone. It is a cash register — not a restaurant management system, not an inventory tracker. Cash register.

- **Free tier**: Cash-only, no account, no internet required
- **Paid tier**: Adds Stripe card payments at 1% per transaction (Tap to Pay on iPhone, Bluetooth readers)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| App | React Native + Expo 55 (managed workflow), TypeScript strict |
| State | React Context + useReducer (no Redux) |
| Navigation | React Navigation (bottom tabs + stacks) |
| Local DB | expo-sqlite (WAL mode, parameterized queries, migration system) |
| Payments | Stripe Terminal SDK (TTPOi + Bluetooth readers) |
| Server | Express.js + TypeScript |
| Server DB | PostgreSQL 16 (raw SQL via `pg`, no ORM) |
| Auth | JWT (24h expiry) + Sign in with Apple |
| Receipts | SMS (Twilio), Email (SendGrid), Bluetooth printer (ESC/POS) |
| Errors | Sentry |
| Deploy | Docker Compose + Caddy (Hetzner, api.ospos.app) |

## Project Structure

```
ospos/
  App.tsx                    # Root: fonts, Sentry, error boundary, navigation
  src/
    screens/                 # All screens (Order, Payment, Receipt, Summary, Settings, etc.)
      onboarding/            # Multi-step onboarding flow (9 screens)
    components/              # Reusable UI (modals, NumericPad, ChargeButton, etc.)
    db/
      database.ts            # DB init, WAL mode, integrity checks
      schema.ts              # Migration definitions (v1–v5)
      migrations.ts          # Migration runner
      queries.ts             # All SQLite queries
    state/
      AppContext.tsx          # Global state provider (order, settings, online status)
      reducers.ts            # Order + Settings reducers
    services/
      api.ts                 # HTTP client (auth, stripe, payments, sync, receipts)
      terminal.ts            # Stripe Terminal SDK wrapper
      sync.ts                # Background sync (30s interval, exponential backoff)
      printer.ts             # ESC/POS Bluetooth printer
      notifications.ts       # Push notifications
    utils/                   # currency.ts, backup.ts, export.ts, haptics.ts, etc.
    constants/
      theme.ts               # Design system (colors, fonts, spacing)
      strings.ts             # All UI text (i18n-ready, externalized)
    navigation/
      OnboardingNavigator.tsx
  server/
    src/
      index.ts               # Express setup, rate limiting, Helmet, CORS
      routes/                 # auth, stripe, payments, sync, disputes, receipts, webhooks
      services/               # stripe.ts, twilio.ts, sendgrid.ts
      middleware/
      db/
        migrations/           # PostgreSQL migrations (v1–v3)
        queries/
    docker-compose.yml        # Local dev
    docker-compose.prod.yml   # Production (Caddy + Node + Postgres)
  mock-backend/               # Fake API for development (no Stripe needed)
```

## Design System — "Liquid Glass" v2.1

Dark venue-mode theme. Works in bright sunlight AND dim bars. **No light theme.**

### Colors
- **Background**: `#09090B` (darkest) → `#18181B` (surface) → `#27272A` (surface light/border)
- **Text**: `#FAFAFA` (primary) → `#A1A1AA` (secondary) → `#8E8E93` (muted)
- **Primary/Success**: Cyan `#22D3EE` / `#06B6D4`
- **Danger**: Red `#EF4444`
- **Warning/Cash**: Orange `#F59E0B`
- **Accent**: Sand/gold `#D4A574`

### Typography
- **Headers/Body**: Bitter (slab serif) — `Bitter_700Bold`, `600SemiBold`, `500Medium`, `400Regular`
- **All numbers/prices**: Archivo (grotesque sans) — `Archivo_700Bold`, `600SemiBold`, `500Medium`, `400Regular`
- Sizes: largeTitle 34, title1 28, title2 22, title3 20, body 17, caption 13, price 20, total 32

### Spacing & Touch
- Spacing: `xs:4 sm:8 md:12 lg:16 xl:20 xxl:24 xxxl:32`
- Border radius: `sm:6 md:10 lg:14 xl:20`
- Touch targets: minimum 48pt, charge button 56pt

## Key Conventions

- **All money in integer cents** — no floating point anywhere. Conversion only at display time via `formatCurrency()`
- **All UI strings in `src/constants/strings.ts`** — no hardcoded text in components
- **Parameterized SQL everywhere** — both SQLite and PostgreSQL, never string interpolation
- **Soft deletes** for menu items (`deleted_at` column)
- **Order items denormalized** — name/price captured at time of sale
- **Functional components only** — no class components (except ErrorBoundary)
- **Strict TypeScript** — no `any` unless forced by external libs
- **File naming**: PascalCase for components/screens, camelCase for utilities
- **No ORM** — raw SQL with `pg` on server, `expo-sqlite` on client

## Architecture Decisions

- **Offline-first**: Cash transactions work with zero connectivity. Card payments queue in `sync_queue` table and sync when online (30s background interval, exponential backoff up to 30s, max 10 retries)
- **Stripe Connect Standard accounts**: Merchants own their Stripe account. OSPOS takes 1% application fee
- **No external state libraries**: Context + useReducer handles everything
- **SQLite WAL mode**: Better concurrency for read-heavy POS workload
- **JWT auth**: 24-hour tokens stored in `expo-secure-store`

## Development

```bash
# App
npm install && npx expo start

# Mock backend (for dev — no Stripe needed)
cd mock-backend && npm install && npm start

# Production server
cd server && cp .env.example .env && docker compose up && npm run migrate && npm run dev

# Type check
npx tsc --noEmit
```

App uses `EXPO_PUBLIC_API_MODE=mock` in dev (points to mock-backend on localhost:3000).

## Current State (as of March 2026)

**Code complete. TypeScript compiles clean. Server deployed.**

### Done
- All app features: menu, orders, cash/card payments, receipts, sales summary, refunds, CSV export
- Tap to Pay on iPhone (5-phase compliance, Apple-approved copy, legal disclaimers)
- Sign in with Apple + email/password auth + account deletion
- Stripe Connect onboarding + requirements tracking + dispute evidence
- Background sync engine with retry logic
- Server deployed to Hetzner (api.ospos.app, HTTPS via Caddy)
- All 3 PostgreSQL migrations applied
- Website pages (terms, privacy, help) uploaded
- Integer cents end-to-end (no float money anywhere)

### Waiting on external
- Twilio A2P registration if SMS receipts wanted at launch (optional —
  SendGrid replaced by Resend for email; SMS still stubbed)

### Done since last note
- `ospos.app`, `www.ospos.app`, `api.ospos.app` all resolve to 157.180.82.227
- Resend live for email receipts (3K/mo free tier, ospos.app DNS verified)
- TTPOi Publishing Entitlement granted by Apple (Case-ID 18719391)
- TestFlight builds live with chunky v1.1 design + ProximityReaderDiscovery

### Not yet started
- App Store Connect metadata (screenshots, description, keywords,
  privacy questionnaire, App Review notes)

## Navigation Structure

**Main app** (bottom tabs): Order → Menu → Summary → Settings

**Order stack**: OrderScreen → PaymentScreen → ReceiptScreen
**Summary stack**: SummaryScreen → TransactionDetailScreen
**Settings stack**: SettingsScreen → DisputesScreen, TTPOiSetupScreen, TTPOiEducation

**Onboarding** (stack): Welcome → ModeSelect → StripeAuth → StripeOnboarding → BusinessName → CurrencySelect → TaxRate → ReceiptFooter → Final

## Server API

Rate limits: 300/min global, 20/15min auth, 60/min everything else. Webhooks unlimited.

Key endpoints:
- `POST /auth/register|login|apple|delete-account`
- `POST /stripe/onboarding` — start Connect flow
- `POST /stripe/connection-token` — Terminal SDK token
- `GET /stripe/account-status|account-details|account-requirements`
- `POST /payments/create-intent|refund|sync`
- `POST /sync/push` / `GET /sync/pull?since=`
- `GET /disputes/list` / `POST /disputes/submit-evidence`
- `POST /receipts/send-sms|send-email`

## Don't Do

- Don't add a light theme
- Don't introduce Redux, Zustand, or other state libs
- Don't add an ORM
- Don't break offline cash functionality
- Don't add decorative animations (only state-communicating ones)
- Don't use floating point for money
- Don't hardcode UI strings — use `strings.ts`
