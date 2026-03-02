# OSPOS Backend Server

Express.js + TypeScript backend for OSPOS payment processing.

## Quick Start

```bash
# Start dev environment (server + postgres)
docker-compose up -d

# Run migrations
npm run migrate

# Start dev server
npm run dev
```

## API Testing (curl)

### Health Check
```bash
curl http://localhost:3000/health
```

### Auth
```bash
# Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password123"}'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password123"}'
```

### Stripe Connect (requires JWT)
```bash
TOKEN="your-jwt-token"

# Start onboarding
curl -X POST http://localhost:3000/stripe/onboarding \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"return_url": "ospos://stripe/return", "refresh_url": "ospos://stripe/refresh"}'

# Check account status
curl http://localhost:3000/stripe/account-status \
  -H "Authorization: Bearer $TOKEN"

# Get connection token (for Terminal SDK)
curl -X POST http://localhost:3000/stripe/connection-token \
  -H "Authorization: Bearer $TOKEN"
```

### Payments (requires JWT)
```bash
# Create payment intent ($25.00 = 2500 cents)
curl -X POST http://localhost:3000/payments/create-intent \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 2500, "currency": "usd"}'

# Refund (full)
curl -X POST http://localhost:3000/payments/refund \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"paymentIntentId": "pi_xxx"}'

# Refund (partial - $10.00)
curl -X POST http://localhost:3000/payments/refund \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"paymentIntentId": "pi_xxx", "amount": 1000}'
```

### Disputes (requires JWT)
```bash
# List disputes
curl http://localhost:3000/disputes/list \
  -H "Authorization: Bearer $TOKEN"

# Submit evidence
curl -X POST http://localhost:3000/disputes/submit-evidence \
  -H "Authorization: Bearer $TOKEN" \
  -F "dispute_id=uuid-here" \
  -F "description=Customer received the goods" \
  -F "image=@evidence.jpg"
```

### Sync (requires JWT)
```bash
# Push sync records
curl -X POST http://localhost:3000/sync/push \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"records": [{"id": 1, "table_name": "orders", "payload": {...}}]}'

# Pull since timestamp
curl "http://localhost:3000/sync/pull?since=2024-01-01T00:00:00Z" \
  -H "Authorization: Bearer $TOKEN"
```

### Webhooks (Stripe CLI)
```bash
stripe listen --forward-to localhost:3000/webhooks/stripe
```

## Environment Variables

See `.env.example` for all required variables.
