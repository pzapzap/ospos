# OSPOS Architecture

Tech stack, deployment, database schema, sync engine, and security model — for contributors, self-hosters, and curious readers.

## System overview

```
┌──────────────────────────┐
│  iPhone app              │
│  React Native + Expo 55  │
│  TypeScript strict       │
│                          │
│  ┌────────────────────┐  │
│  │ Local SQLite (WAL) │  │  ← cash sales, menu, settings, queue
│  └────────────────────┘  │
│                          │
│  ┌────────────────────┐  │
│  │ Stripe Terminal    │  │  ← Tap to Pay on iPhone
│  │ SDK (native)       │  │
│  └─────────┬──────────┘  │
└────────────┼─────────────┘
             │ HTTPS
             ▼
┌──────────────────────────┐
│  api.ospos.app           │  Hetzner cloud, Caddy auto-HTTPS
│  Express + TypeScript    │
│  PostgreSQL 16           │
│  Docker Compose          │
└────────────┬─────────────┘
             │ Stripe-Account header
             ▼
┌──────────────────────────┐
│  Stripe Connect          │
│  Standard accounts       │  ← merchant owns
└──────────────────────────┘
```

## App stack

| Layer | Choice | Why |
|---|---|---|
| Framework | React Native + Expo SDK 55 | Single codebase, native modules where needed |
| Language | TypeScript strict | Catches issues at compile time, no `any` unless forced |
| Navigation | React Navigation (bottom tabs + native stacks) | Standard for RN, native feel |
| State | React Context + useReducer | No Redux/Zustand — keeps the dep graph small |
| Local DB | expo-sqlite in WAL mode | High concurrency for read-heavy POS workload |
| Payments | Stripe Terminal SDK (`@stripe/stripe-terminal-react-native`) | Tap to Pay on iPhone + Bluetooth readers |
| Auth storage | expo-secure-store, pinned to device | Keychain items don't sync to iCloud |
| Error monitoring | Sentry | Production crash + performance reporting |
| Fonts | Inter (UI), DM Serif Display (hero), Bitter italic (menu monograms), JetBrains Mono (eyebrows) | Mixed-voice design system |

## Server stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node 20+ | Modern enough, LTS for years |
| Framework | Express.js + TypeScript | Battle-tested, small surface area |
| Database | PostgreSQL 16 | Reliable, transactional, well-supported |
| Database access | Raw SQL via `pg` (no ORM) | Predictable performance, no magic |
| Authentication | JWT, 24h expiry | Stateless, server-side revocation table for logout/delete |
| Payments backend | Stripe Connect Standard via OAuth | Merchants own their Stripe account |
| Email | Resend | Fast delivery, good deliverability |
| Container | Docker Compose | Simple deploy, easy local reproduction |
| Reverse proxy | Caddy | Auto-HTTPS via Let's Encrypt, simple config |
| Host | Hetzner cloud | Cheap, reliable |
| Errors | Sentry | Same DSN as app for unified view |

## Money handling

All monetary amounts are **integer cents** end to end:

- Database columns are `INTEGER`
- API payloads send/receive integers
- Conversion to display value happens **only** at format time via `formatCurrency()`
- No floating-point math anywhere in the money path

This eliminates entire classes of rounding bugs.

## Database schema

### Local (SQLite on the phone)

Migrations live in `src/db/schema.ts` (versions v1–v5). Key tables:

- `items` — menu items (id, name, price_cents, category, image_uri, sticker_id, deleted_at)
- `orders` — completed transactions (id, subtotal, tax_rate, tax_amount, tip_amount, total, payment_method, status, created_at, ...)
- `order_items` — line items, denormalized name + price captured at sale time
- `settings` — key/value: business_name, tax_rate, currency, receipt_footer, tier, ttpoi_setup_complete, ...
- `sync_queue` — pending sync to server (id, type, payload, retry_count, last_attempted_at)

Deletes for menu items are **soft** (`deleted_at` set) so historical orders remain readable.

### Server (PostgreSQL)

Migrations live in `server/src/db/migrations/`. Versions 1–6:

- `users` — id, email, password_hash, apple_identifier, stripe_account_id, terminal_location_id, push_token, created_at
- `synced_orders` — id, user_id, subtotal, tax_rate, tax_amount, tip_amount, total, payment_method, stripe_payment_id, refund_status, refund_amount, status, created_at
- `dispute_records` — id, user_id, stripe_dispute_id, stripe_payment_intent_id, amount, reason, status, due_by
- `revoked_tokens` — jti, user_id, expires_at, reason (for JWT revocation)
- `stripe_oauth_state` — state, user_id, expires_at (single-use CSRF protection for OAuth)

## Sync engine

The app works offline by default. Cash sales never touch the server. Card sales need internet at the moment of authorization (Stripe must approve the card), but if the network drops between authorization and metadata sync, the order persists locally and re-syncs.

Sync runs every **30 seconds** in the background while the app is open:

- Push: any order in `sync_queue` POSTs to `/sync/push` and gets removed on success
- Pull: any updates from server (dispute notifications, etc.) come down via `/sync/pull?since=…`
- Failure: exponential backoff up to 30s between attempts, max 10 retries before manual intervention

See `src/services/sync.ts` for the engine.

## Stripe Connect flow

OSPOS uses **Stripe Connect Standard** with OAuth. New merchant onboarding:

1. Merchant taps "Set up payments" in the app
2. App calls `POST /stripe/onboarding` — server generates an OAuth `state` token (single-use, 10-min TTL) and returns the Stripe authorize URL
3. App opens the URL in **system Safari** via `Linking.openURL` (NOT an embedded WebView — Stripe blocks WebView for OAuth security)
4. Merchant signs in to their existing Stripe account or creates one
5. Stripe redirects to `GET /stripe/oauth/callback?code=…&state=…`
6. Server verifies the state, exchanges the code for the merchant's `stripe_user_id` (their `acct_xxx`), persists it on the user row
7. Server responds with an HTML bridge that deep-links to `ospos://stripe/return`, bringing the app back to foreground
8. App calls `/stripe/account-status` to refresh local cache and proceeds to next onboarding step

Every PaymentIntent the app creates is a direct charge on the merchant's connected account with `application_fee_amount: 1%` going to the OSPOS platform.

## Server API

Mounted under `https://api.ospos.app`. Rate limits: 300/min global, 20/15min for `/auth/*`, 60/min everything else. Webhooks unlimited.

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Email + password signup |
| POST | `/auth/login` | Email + password login |
| POST | `/auth/apple` | Sign in with Apple |
| POST | `/auth/logout` | Revoke JWT |
| POST | `/auth/delete-account` | Permanent deletion (CASCADE) |
| POST | `/stripe/onboarding` | Start OAuth or return existing connection |
| GET | `/stripe/oauth/callback` | OAuth code exchange (no auth) |
| POST | `/stripe/disconnect` | Wipe local Stripe linkage |
| POST | `/stripe/connection-token` | Issue Stripe Terminal SDK token |
| GET | `/stripe/account-status` | Merchant's connected account state |
| GET | `/stripe/account-details` | Merchant business name, currency, address |
| GET | `/stripe/account-requirements` | Outstanding Stripe verification items |
| POST | `/payments/create-intent` | Create PaymentIntent on connected account |
| POST | `/payments/refund` | Issue refund |
| POST | `/payments/sync` | Bulk push of offline orders |
| POST | `/sync/push` | Single order push |
| GET | `/sync/pull?since=` | Pull updates since timestamp |
| GET | `/disputes/list` | Outstanding disputes |
| POST | `/disputes/submit-evidence` | Submit dispute evidence |
| POST | `/receipts/send-email` | Email receipt via Resend |
| POST | `/webhooks/stripe` | Stripe webhook receiver (no auth, HMAC verified) |

## Security model

- **Card data never touches OSPOS servers.** It flows from the customer's card → Apple's Secure Element → Stripe directly. PCI scope: minimal.
- **JWT auth, 24-hour expiry, server-side revocation.** Logout revokes via a `revoked_tokens` table the auth middleware checks on every request.
- **Local secrets** (JWT, terminal location ID) are stored in iOS Keychain pinned to `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`. They don't sync to iCloud, can't be exported, are removed on app delete.
- **OAuth CSRF protection** via single-use `state` tokens with 10-minute TTL.
- **Stripe webhook signature verification** on every webhook event.
- **Parameterized SQL everywhere** — no string interpolation, no injection surface.
- **Audited against [OWASP MASVS](https://owasp.org/www-project-mobile-app-security/)** — the mobile application security verification standard.

## Open-source license interaction with Stripe

Stripe Connect requires a Stripe-side platform application. Each fork of OSPOS that wants to charge real cards needs its own:

- Stripe Connect Standard platform application (a Connect platform account at stripe.com)
- OAuth `client_id` registered with that platform
- Apple Tap to Pay on iPhone entitlement for the fork's bundle ID

A fork can use cash-only flow with no Stripe setup — just point `STRIPE_CONNECT_MODE` to `express` (legacy, present for backward compat) or simply never call card endpoints. The cash path runs entirely client-side.

## Deployment

### Hosted (TTTS Co.)

Lives on a single Hetzner cloud VM at `api.ospos.app` running Docker Compose:

- `server` — the Express app
- `postgres` — PostgreSQL 16
- `caddy` — reverse proxy + auto-HTTPS via Let's Encrypt

Deploy is `docker compose -f docker-compose.prod.yml up -d --build`.

### Self-hosting

See [README.md](./README.md) for the basic dev setup. Production self-host requires:

1. A VM with Docker + Docker Compose
2. A domain with DNS pointing to it
3. A Stripe Connect platform account with OAuth registered
4. (Optional) An Apple Tap to Pay entitlement if you want card payments via TTPOi
5. Resend (or any SMTP provider) for email receipts

We don't have a guided self-host walkthrough yet — contributions welcome.

## What's NOT in the architecture

OSPOS deliberately doesn't include:

- **Table management** — not a restaurant POS
- **Inventory/SKU tracking** — not an inventory system
- **Employee accounts / time clock** — single-merchant model
- **Multi-location reporting** — single-instance model
- **E-commerce / online ordering** — in-person only
- **Loyalty programs** — out of scope
- **An ORM** — raw SQL is fine
- **Redux, Zustand, or other state libraries** — Context + reducers is enough
- **A light theme** — dark-only by design

If you want any of those, you probably want a different tool. We won't merge PRs adding them.

## Roadmap

The current public roadmap (subject to change):

- **v1.0** (shipped): US, iPhone, cash + Tap to Pay
- **v1.1**: Canada, UK, Australia, NZ, Singapore, Ireland; partial refunds; customer email stored on transactions
- **v1.2+**: EU countries, Android consideration, Bluetooth printer support
- **Deferred from v1**: hourly sales chart, "vs yesterday" delta on Sales screen

## Questions

Open a [GitHub Discussion](https://github.com/pzapzap/ospos/discussions) or email phil@tttships.co.
