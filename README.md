# OSPOS

A free, open-source point-of-sale app for iPhone. Cash for nothing, cards at 1% on top of Stripe's processing rate. No monthly subscription, no hardware to buy, no contract.

Built by [TTTS Co.](https://ospos.app) for small merchants who hate giving 3–4% of every sale to a payment processor.

[App Store](https://apps.apple.com/us/app/ospos/id6766436501) · [ospos.app](https://ospos.app) · [phil@tttships.co](mailto:phil@tttships.co)

---

## What it does

- **Cash transactions**: free, work offline, no signup required.
- **Card transactions**: via Apple's Tap to Pay on iPhone. Your iPhone is the card reader — no external hardware. 1% OSPOS application fee on top of Stripe's standard processing rate (2.7% + 5¢ for in-person card-present in the US).
- **Your iPhone is the entire system**. No reader to lose or charge.
- **You own your Stripe account.** OSPOS uses Stripe Connect Standard. Your business connects under your own Stripe account, not a sub-account we control. Daily payouts directly to your bank.
- **Offline-first.** Cash works without any internet. Card transactions queue and sync when you reconnect.
- **Email receipts** via Resend.
- **Daily sales summary** with cash/card breakdown and CSV export.
- **In-app refunds.**

## Why open source

1. **Trust.** Card-processing infrastructure shouldn't be a black box. Anyone can audit OSPOS for security, privacy, or how the 1% fee is computed.
2. **No vendor lock-in.** Your Stripe account is yours. Your transaction data is on your phone, exportable to CSV. The code is forkable. If TTTS Co. ever disappears, you keep running.
3. **Better software.** Contributors find bugs and ship improvements faster than any closed team.

## Status

OSPOS v1.1 ships **US-only, iPhone-only** (XS or newer, iOS 16.4+). v1.1 adds modifier groups, QSR mode, expanded sticker library, order-level discounts, and a sold-out toggle for items and modifiers. Other countries and Android are on the roadmap.

The hosted version at [ospos.app](https://ospos.app) is live. Self-hosting is fully supported — see [ARCHITECTURE.md](./ARCHITECTURE.md) for deployment.

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│  iPhone app     │────▶│  api.ospos.app       │────▶│  Stripe Connect  │
│  React Native   │     │  Node + Postgres     │     │  Standard        │
│  Expo SDK 55    │     │  Docker on Hetzner   │     │  (merchant's)    │
└─────────────────┘     └──────────────────────┘     └──────────────────┘
       │
       └── Local SQLite (offline cash sales)
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full picture: tech stack, deployment, database schema, sync engine, security model.

## Repository layout

```
ospos/
├── App.tsx                    # React Native entry
├── src/                       # App code
│   ├── screens/               # Order, Payment, Receipt, Sales, Settings, onboarding
│   ├── components/            # Reusable UI (modals, buttons, ...)
│   ├── db/                    # SQLite schema + queries + migrations
│   ├── services/              # API client, Stripe Terminal SDK, sync engine
│   ├── state/                 # React Context + reducers
│   └── constants/             # Theme, strings (i18n-ready)
├── server/                    # Node + Express + Postgres backend
│   ├── src/routes/            # /auth, /stripe, /payments, /sync, /webhooks
│   ├── src/services/          # Stripe, Resend wrappers
│   └── docker-compose.prod.yml
├── ios/                       # Expo prebuild native iOS project
├── modules/ttpoi-native/      # Apple Tap to Pay native module
├── mock-backend/              # Fake API for dev (no Stripe needed)
└── screenshots/appstore/      # App Store screenshots
```

## Development

### App

```bash
npm install
npx expo start --dev-client
```

You'll need an Expo development build installed on a physical iPhone (XS or newer, iOS 16.4+) or simulator. See [CONTRIBUTING.md](./CONTRIBUTING.md) for dev build setup.

### Mock backend (no Stripe needed)

```bash
cd mock-backend && npm install && npm start
# In the app:
EXPO_PUBLIC_API_MODE=mock npx expo start --dev-client
```

The mock backend stubs every API call — useful for UI work or contributing without a Stripe account.

### Production backend (your own deployment)

```bash
cd server
cp .env.example .env
# Fill in: DATABASE_URL, JWT_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
# STRIPE_CONNECT_MODE, STRIPE_CONNECT_CLIENT_ID, STRIPE_CONNECT_REDIRECT_URI,
# RESEND_API_KEY, RESEND_FROM_EMAIL
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec server node dist/db/migrate.js
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full deployment guide (DNS, Caddy auto-HTTPS, Stripe Connect setup).

## Tap to Pay on iPhone

OSPOS uses Apple's Tap to Pay on iPhone via the Stripe Terminal SDK. Requirements:

- iPhone XS or newer running iOS 16.4 or later
- US-based business with a US bank account
- Stripe Connect Standard account (the app walks the merchant through OAuth on first use)

Tap to Pay capability is granted by Apple per app, not per developer. If you fork OSPOS and want to enable Tap to Pay in your fork, you'll need to apply for [Apple's Tap to Pay on iPhone Entitlement](https://developer.apple.com/contact/request/tap-to-pay-on-iphone/) for your fork's bundle ID.

## Pricing (hosted version)

The hosted version at [ospos.app](https://ospos.app) charges:

- **Cash**: free.
- **Card**: 1% OSPOS application fee on top of Stripe's standard processing rate (currently 2.7% + 5¢ for in-person card-present in the US).

The fee is visible to merchants line-by-line on their Stripe dashboard. No monthly subscription, no setup fee, no contract, no hardware purchase.

If you self-host, you set your own fee (or charge nothing). The AGPL license permits any commercial use — see Licensing below.

## Contributing

Bug reports, feature requests, and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for dev setup, code style, and PR process.

If you've found a security vulnerability, please **don't open a public issue** — see [SECURITY.md](./SECURITY.md) for the responsible-disclosure process.

## Licensing

OSPOS is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0). See [LICENSE](./LICENSE) for the full text.

In plain language:

- You can use, modify, and self-host OSPOS for any purpose, commercial or not.
- If you modify OSPOS and run it as a service that others access over a network, you must make your modifications available to those users under the same AGPL license.
- The OSPOS name and logo are trademarks of TTTS Co. and are not granted by the AGPL — a fork can use the code but can't call itself "OSPOS" without permission.

This license is intentional. It keeps OSPOS open and ensures that improvements made by anyone running OSPOS as a service flow back to the community, instead of being kept private.

## Trademark

"OSPOS" is a trademark of TTTS Co. The AGPL license covers the source code, not the brand. If you fork OSPOS and run your own version, please call it something else.

## Maintainer

OSPOS is built and maintained by [Phil Zamarripa](https://github.com/pzapzap) at TTTS Co.

- **Questions, partnerships, press**: phil@tttships.co
- **Security disclosures**: see [SECURITY.md](./SECURITY.md)
