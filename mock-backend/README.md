# OSPOS Mock Backend

A lightweight mock server for OSPOS development and contribution. Returns fake responses so you can test the app without a Stripe account or production backend.

## Implemented Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/register | Returns fake JWT |
| POST | /auth/login | Returns fake JWT |
| POST | /stripe/onboarding | Returns fake onboarding URL |
| POST | /stripe/onboarding/refresh | Returns fake refresh URL |
| GET | /stripe/account-status | Returns mock account status |
| POST | /stripe/connection-token | Returns mock token |
| POST | /payments/create-intent | Returns fake clientSecret |
| POST | /payments/refund | Returns mock refund |
| POST | /sync/push | Accepts and discards data |
| GET | /sync/pull | Returns empty array |
| POST | /receipts/send | Returns success |

All other routes return `501 Not Implemented`.

## Quick Start

```bash
cd mock-backend
npm install
npm start
```

Or with Docker:

```bash
docker compose up
```

The server runs on port 3000 by default. Set the `PORT` environment variable to change it.

## Usage with the App

The app's API service (`src/services/api.ts`) points to `http://localhost:3000` in development mode (`__DEV__`). Just start the mock backend and run the app.

## Note

This is for development and contribution testing only. Card payments will not actually process — the mock backend returns success for everything. For real payment processing, see the `server/` directory.
