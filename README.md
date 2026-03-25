# OSPOS — Open Source Point of Sale

A free, open source point of sale app that runs on any smartphone. It is a cash register. Not a restaurant management system. Not an inventory tracker. A cash register.

## Branches

| Branch | Purpose |
|--------|---------|
| `master` | Shared base — stable code that both platforms build from |
| `ios` | iOS production build (App Store) |
| `android` | Android build (Play Store) — includes Google Sign-In, Tap to Pay on Android |

**iOS-only changes** go on `ios`. **Android-only changes** go on `android`. **Shared changes** go on `master` and get merged into both.

## What OSPOS Does

- **Build a menu** — add items with names, prices, and photos
- **Take orders** — tap items, see the total, charge the customer
- **Accept cash or card** — free tier is cash only, paid tier adds Stripe card payments (1% fee)
- **View sales** — daily summary with totals, transaction history, CSV export
- **Send receipts** — SMS, email, or Bluetooth thermal printer
- **Work offline** — cash transactions work without internet, card payments sync when connectivity returns

## Getting Started (Free Tier)

1. Install the app from the [App Store](#) or [Play Store](#)
2. Select "Free — Cash Only"
3. Add your menu items
4. Start selling

No account. No internet. No monthly fee.

## Getting Started (Card Payments)

1. Install the app
2. Select "Accept Card Payments"
3. Create an account and complete Stripe onboarding
4. Use Test Mode to practice
5. Go live — 1% per card transaction, no monthly fee

## Development Setup

### Prerequisites

- Node.js 20+
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac) or Android Emulator

### App (React Native)

```bash
cd ospos
npm install
npx expo start
```

### Mock Backend (for development)

```bash
cd mock-backend
npm install
npm start
```

The app points to `http://localhost:3000` in development mode. The mock backend returns fake responses for all API calls — no Stripe account needed.

### Production Backend

```bash
cd server
cp .env.example .env
# Fill in your Stripe keys, database URL, JWT secret
docker compose up
npm run migrate
npm run dev
```

See `server/README.md` for full API documentation.

## Tech Stack

**App:**
- React Native + Expo (managed workflow)
- TypeScript (strict mode)
- React Navigation (bottom tabs + stack navigators)
- React Context + useReducer (no Redux)
- expo-sqlite (WAL mode, integrity checks, migration system)
- Stripe Terminal SDK (Tap to Pay + Bluetooth reader)
- expo-notifications, expo-haptics, expo-file-system

**Backend:**
- Express.js + TypeScript
- PostgreSQL (raw parameterized SQL with pg)
- Stripe Connect (Standard accounts)
- JWT authentication
- Twilio (SMS receipts), SendGrid (email receipts)

## Project Structure

```
ospos/
  src/
    screens/        # All app screens
    components/     # Reusable UI components
    db/             # SQLite database, migrations, queries
    state/          # AppContext, reducers
    services/       # API, sync, terminal, printer, notifications
    utils/          # Currency, tax, haptics, export, backup
    constants/      # Theme, strings
  server/           # Production backend (Express + PostgreSQL)
  mock-backend/     # Development mock server
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development environment setup, code style, and PR process.

## License

MIT — see [LICENSE](LICENSE)

## Links

- [Website](https://ospos.app)
- [GitHub](https://github.com/pzapzap/ospos)
