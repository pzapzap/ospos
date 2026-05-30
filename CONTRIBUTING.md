# Contributing to OSPOS

Thanks for your interest in contributing. Bug reports, feature requests, docs improvements, and pull requests are all welcome.

## Quick links

- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Security policy](./SECURITY.md) (don't open public issues for vulnerabilities)
- [Architecture overview](./ARCHITECTURE.md)
- [License](./LICENSE) — AGPL-3.0

## Reporting bugs and requesting features

Use the GitHub issue templates:

- **Bug Report** — for things that are broken
- **Feature Request** — for new ideas

If you're not sure whether something is a bug, open an issue anyway — we'd rather close as "working as intended" than miss a real problem.

## Development environment

### Prerequisites

- Node.js 20+
- macOS with Xcode 15+ and iOS Simulator (for app development)
- Docker + Docker Compose (for the server)

OSPOS v1 is **iPhone-only** (XS or newer, iOS 16.4+). Android support is on the v1.1+ roadmap; there's no Android branch to develop against today.

### App setup

```bash
git clone https://github.com/pzapzap/ospos.git
cd ospos
npm install
```

You'll need an Expo **development build** of OSPOS installed on your phone or simulator. The plain Expo Go app won't work because OSPOS uses native modules (Stripe Terminal SDK, our custom TTPOi module).

To make a dev build:

```bash
npx eas-cli build --platform ios --profile development
```

(Requires an Expo account. Free tier is enough for occasional dev builds.)

Then start Metro:

```bash
npx expo start --dev-client
```

### Mock backend (no Stripe needed)

The fastest way to work on UI without setting up Stripe:

```bash
cd mock-backend
npm install
npm start
```

In another terminal, start the app pointing at the mock:

```bash
EXPO_PUBLIC_API_MODE=mock npx expo start --dev-client
```

The mock backend stubs every API call. Cash transactions work, card transactions return fake successes, sync queues complete instantly.

### Production backend

If you need to test actual Stripe flow, you'll need a Stripe Connect platform account and a backend. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full setup.

```bash
cd server
cp .env.example .env
# Fill in env vars (see .env.example for the list)
docker compose up -d
npm install
npm run migrate
npm run dev
```

Then point the app at it:

```bash
EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start --dev-client
```

### Environment variables

App:

- `EXPO_PUBLIC_API_MODE` — `mock` (default in dev) or `production`
- `EXPO_PUBLIC_MOCK_API_URL` — mock backend URL (default: `http://localhost:3000`)
- `EXPO_PUBLIC_API_URL` — production API URL (default: `https://api.ospos.app`)

Server: see `server/.env.example` for the full list.

## Code style

### TypeScript

- Strict mode enabled — no `any` unless an external library forces it
- All files use `.ts` or `.tsx`
- Explicit return types on exported functions
- Interfaces over types where possible

### React (Native)

- Functional components only — no class components (except `ErrorBoundary`)
- Hooks for state and side effects
- **React Context + useReducer** for global state — no Redux, no Zustand, no MobX
- Props interfaces defined adjacent to the component

### Naming

- Files: PascalCase for components and screens (`OrderScreen.tsx`), camelCase for utilities (`currency.ts`)
- Components: PascalCase (`ChargeButton`)
- Functions: camelCase (`formatCurrency`)
- Constants: `UPPER_SNAKE_CASE` for true constants (`TIER_KEY`), camelCase for config objects (`colors`)

### Database

- All SQL queries use parameterized statements (never string interpolation)
- Migrations are sequential and versioned (`001_initial.sql`, `002_...`)
- Soft deletes for menu items (`deleted_at` column)
- Order items denormalize name + price at sale time so historical orders stay readable

### Money

- **All money is integer cents.** No floats anywhere in the money path — database, API, internal logic. Convert to display only via `formatCurrency()` at render time.

### Strings

- All user-facing text lives in `src/constants/strings.ts`
- No hardcoded strings in components — enables future i18n

### Design system

- Inter for UI text, body, labels, buttons
- DM Serif Display for display moments (page titles, hero numbers, payment totals)
- Bitter Italic for menu monogram letters
- JetBrains Mono for eyebrows / technical metadata
- Cyan (`colors.primary`) reserved for the single primary action on screen — don't use it as decoration
- Dark theme only (intentional, not a bug)

See `src/constants/theme.ts` for tokens.

## Pull request process

1. Fork the repo
2. Create a feature branch from `master`
3. Make your changes
4. Run TypeScript check: `npx tsc --noEmit` (must pass)
5. Test on the iOS simulator
6. Open a PR using the template

### What makes a good PR

- Small and focused — one feature or fix per PR
- Follows existing patterns
- Strings externalized
- Includes TypeScript types
- Doesn't add new dependencies without discussion
- UI matches the dark theme
- Money is integer cents

### What we won't merge

- Changes that break offline functionality
- New state management libraries
- Decorative animations (only state-communicating animations)
- Light/white theme changes
- ORM additions to the backend
- Hardcoded user-facing strings
- Floating-point money math

### CLA / sign-off

OSPOS is licensed under AGPL-3.0. By contributing, you agree your contributions are licensed under the same AGPL-3.0 terms.

We don't require a formal Contributor License Agreement, but we do encourage signing commits (`git commit -s`) — it's a Developer Certificate of Origin attestation that you have the right to submit the work.

## Reviewing

Maintainers triage new issues and PRs within 48 hours (best effort — we're a small team).

Reviews focus on:

- Does it match existing patterns?
- Does it preserve offline functionality?
- Money handling correctness
- Security implications (especially anything touching auth, Stripe, or PII)
- Visual consistency with the design system

## Questions

- General questions: [GitHub Discussions](https://github.com/pzapzap/ospos/discussions)
- Anything sensitive: phil@tttships.co
- Security: see [SECURITY.md](./SECURITY.md)
