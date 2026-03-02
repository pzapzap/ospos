# Contributing to OSPOS

Thanks for your interest in contributing to OSPOS. This document covers how to set up your development environment, the code style we follow, and the PR process.

## Development Environment

### Prerequisites

- Node.js 20+
- npm or yarn
- Expo CLI: `npm install -g expo-cli`
- For iOS: macOS with Xcode and iOS Simulator
- For Android: Android Studio with an emulator
- For backend: Docker and Docker Compose

### Setup

1. Fork and clone the repository
2. Install app dependencies:
   ```bash
   cd ospos
   npm install
   ```
3. Start the mock backend:
   ```bash
   cd mock-backend
   npm install
   npm start
   ```
4. Start the app:
   ```bash
   npx expo start
   ```

### Environment Variables

The app uses `EXPO_PUBLIC_` prefixed environment variables:

- `EXPO_PUBLIC_API_MODE` — `mock` (default in dev) or `production`
- `EXPO_PUBLIC_MOCK_API_URL` — mock backend URL (default: `http://localhost:3000`)
- `EXPO_PUBLIC_API_URL` — production API URL (default: `https://api.ospos.app`)

## Code Style

### TypeScript

- Strict mode enabled — no `any` types unless required by external libraries
- All files use `.ts` or `.tsx` extensions
- Interfaces over types where possible
- Explicit return types on exported functions

### React

- Functional components only (no class components)
- Hooks for state and side effects
- React Context + useReducer for global state (no Redux, no Zustand)
- Props interfaces defined adjacent to the component

### Naming

- Files: PascalCase for components/screens (`OrderScreen.tsx`), camelCase for utilities (`currency.ts`)
- Components: PascalCase (`ChargeButton`)
- Functions: camelCase (`formatCurrency`)
- Constants: UPPER_SNAKE_CASE for true constants (`TIER_KEY`), camelCase for config objects (`colors`)

### Database

- All SQL queries use parameterized statements (never string interpolation)
- Migrations are sequential and versioned
- Soft deletes for menu items (`deleted_at` column)
- order_items stores denormalized name/price at time of sale

### Text

- All user-facing text lives in `src/constants/strings.ts`
- No hardcoded strings in components
- This enables future i18n without code changes

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Run TypeScript check: `npx tsc --noEmit`
4. Test on both iOS and Android if possible
5. Open a PR with:
   - Clear title describing the change
   - Description of what and why
   - Screenshots for UI changes
6. Wait for review

### What Makes a Good PR

- Small and focused — one feature or fix per PR
- Follows existing patterns in the codebase
- Includes TypeScript types
- Doesn't introduce new dependencies without discussion
- Strings are externalized
- UI matches the dark theme

### What We Won't Merge

- Changes that break offline functionality
- New external state management libraries
- Decorative animations (only state-communicating animations)
- White/light theme changes (the dark theme is intentional)
- ORM additions to the backend (we use raw SQL)

## Reporting Issues

Use the GitHub issue templates:
- **Bug Report** — for things that are broken
- **Feature Request** — for new ideas

## Questions?

Open a GitHub Discussion or reach out at hello@ospos.app.
