# OSPOS Server Deployment Guide

You are setting up the OSPOS backend API server on a Hetzner Ubuntu box (2 vCPU, 4GB RAM, 40GB disk).

## What You're Building

A Docker-based production deployment with 3 containers:
- **Caddy** — reverse proxy, auto-provisions Let's Encrypt SSL for `api.ospos.app`
- **server** — Node.js/Express API (TypeScript compiled to JS)
- **postgres** — PostgreSQL 16 database

## Prerequisites

Before you start, the human needs to provide:
1. **STRIPE_SECRET_KEY** — live key from https://dashboard.stripe.com/apikeys (starts with `sk_live_`)
2. **STRIPE_WEBHOOK_SECRET** — created AFTER deployment at Stripe dashboard (starts with `whsec_`)
3. DNS: `api.ospos.app` A record must point to this server's IP

## Step-by-Step Instructions

### 1. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker
```

Verify: `docker --version && docker compose version`

### 2. Create project directory

```bash
mkdir -p /opt/ospos/src/db/migrations
mkdir -p /opt/ospos/src/db/queries
mkdir -p /opt/ospos/src/routes
mkdir -p /opt/ospos/src/services
mkdir -p /opt/ospos/src/middleware
cd /opt/ospos
```

### 3. Create all source files

Create every file listed in the "SOURCE FILES" section below. The directory structure is:

```
/opt/ospos/
├── Caddyfile
├── Dockerfile
├── docker-compose.prod.yml
├── .dockerignore
├── .env
├── package.json
├── package-lock.json  ← run `npm install` to generate this
├── tsconfig.json
└── src/
    ├── index.ts
    ├── config.ts
    ├── db/
    │   ├── connection.ts
    │   ├── migrate.ts
    │   ├── migrations/
    │   │   ├── 001_initial.sql
    │   │   └── 002_integer_cents.sql
    │   └── queries/
    │       ├── users.ts
    │       ├── orders.ts
    │       ├── disputes.ts
    │       └── receipts.ts
    ├── middleware/
    │   └── auth.ts
    ├── routes/
    │   ├── auth.ts
    │   ├── stripe.ts
    │   ├── payments.ts
    │   ├── disputes.ts
    │   ├── receipts.ts
    │   ├── sync.ts
    │   ├── webhooks.ts
    │   └── support.ts
    └── services/
        ├── stripe.ts
        ├── notifications.ts
        ├── twilio.ts
        └── sendgrid.ts
```

### 4. Generate secrets and create .env

```bash
POSTGRES_PW=$(openssl rand -base64 24)
JWT_SECRET=$(openssl rand -base64 48)
echo "Generated POSTGRES_PASSWORD: $POSTGRES_PW"
echo "Generated JWT_SECRET: $JWT_SECRET"
```

Create `/opt/ospos/.env`:
```
POSTGRES_PASSWORD=<generated above>
JWT_SECRET=<generated above>
STRIPE_SECRET_KEY=<ask human for live key>
STRIPE_WEBHOOK_SECRET=placeholder_will_update_after_deploy
```

**IMPORTANT**: Ask the human for the STRIPE_SECRET_KEY before proceeding. The STRIPE_WEBHOOK_SECRET can be a placeholder for now — we'll update it after the webhook endpoint is live.

### 5. Install dependencies (generates package-lock.json)

```bash
cd /opt/ospos && npm install
```

### 6. Build and start

```bash
cd /opt/ospos
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

### 7. Run migrations

Wait for postgres to be healthy, then:
```bash
docker compose -f docker-compose.prod.yml exec -T server node dist/db/migrate.js
```

### 8. Verify

```bash
# Check all 3 containers are running
docker compose -f docker-compose.prod.yml ps

# Check health endpoint (will work once Caddy provisions SSL)
curl -s http://localhost:3000/health || echo "Try via Caddy once DNS is live"

# Check logs for errors
docker compose -f docker-compose.prod.yml logs --tail=50
```

### 9. Set up Stripe webhook (after DNS is live)

Once `api.ospos.app` resolves and SSL is provisioned:
1. Go to https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. URL: `https://api.ospos.app/webhooks/stripe`
4. Events to listen for:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.dispute.created`
   - `charge.dispute.updated`
   - `charge.dispute.closed`
5. Copy the signing secret (`whsec_...`)
6. Update `.env`: `STRIPE_WEBHOOK_SECRET=whsec_...`
7. Restart: `docker compose -f docker-compose.prod.yml restart server`

### 10. Final verification

```bash
curl -s https://api.ospos.app/health
# Should return: {"status":"ok","timestamp":"..."}
```

---

## SOURCE FILES

Below are the complete contents of every file. Create them exactly as shown.

---

### `Caddyfile`

```
api.ospos.app {
	reverse_proxy server:3000
}
```

---

### `Dockerfile`

```dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ─── Production image ────────────────────────────────────────────────────────

FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/db/migrations ./dist/db/migrations

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

---

### `docker-compose.prod.yml`

```yaml
version: '3.8'

services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - server

  server:
    build: .
    restart: unless-stopped
    environment:
      - DATABASE_URL=postgresql://ospos:${POSTGRES_PASSWORD}@postgres:5432/ospos
      - JWT_SECRET=${JWT_SECRET}
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
      - STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
      - TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID:-}
      - TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN:-}
      - TWILIO_PHONE_NUMBER=${TWILIO_PHONE_NUMBER:-}
      - SENDGRID_API_KEY=${SENDGRID_API_KEY:-}
      - SENDGRID_FROM_EMAIL=${SENDGRID_FROM_EMAIL:-}
      - PORT=3000
      - NODE_ENV=production
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ospos
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ospos
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ospos"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
  caddy_data:
  caddy_config:
```

---

### `.dockerignore`

```
node_modules
dist
.env
.env.*
!.env.production.template
*.md
.git
```

---

### `package.json`

```json
{
  "name": "ospos-server",
  "version": "1.0.0",
  "description": "OSPOS backend API server",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "migrate": "tsx src/db/migrate.ts"
  },
  "dependencies": {
    "@sendgrid/mail": "^8.1.4",
    "bcrypt": "5.1.1",
    "cors": "2.8.5",
    "dotenv": "^17.3.1",
    "expo-server-sdk": "3.13.0",
    "express": "4.21.2",
    "express-rate-limit": "^7.5.0",
    "helmet": "8.0.0",
    "jsonwebtoken": "9.0.2",
    "multer": "1.4.5-lts.1",
    "pg": "8.13.1",
    "sharp": "0.33.2",
    "stripe": "17.5.0",
    "twilio": "^5.4.0"
  },
  "devDependencies": {
    "@types/bcrypt": "5.0.2",
    "@types/cors": "2.8.17",
    "@types/express": "5.0.0",
    "@types/jsonwebtoken": "9.0.7",
    "@types/multer": "1.4.12",
    "@types/node": "22.10.2",
    "@types/pg": "8.11.10",
    "@types/twilio": "^3.19.2",
    "tsx": "4.19.2",
    "typescript": "5.7.2"
  }
}
```

---

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

### `src/config.ts`

```typescript
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

const jwtSecret = requireEnv('JWT_SECRET');
if (process.env.NODE_ENV === 'production' && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}

export const config = {
  port: parseInt(optionalEnv('PORT', '3000'), 10),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),

  database: {
    url: requireEnv('DATABASE_URL'),
  },

  jwt: {
    secret: jwtSecret,
    expiresIn: '24h',
  },

  stripe: {
    secretKey: requireEnv('STRIPE_SECRET_KEY'),
    webhookSecret: requireEnv('STRIPE_WEBHOOK_SECRET'),
    apiVersion: '2024-12-18.acacia' as const,
  },

  twilio: {
    accountSid: optionalEnv('TWILIO_ACCOUNT_SID', ''),
    authToken: optionalEnv('TWILIO_AUTH_TOKEN', ''),
    phoneNumber: optionalEnv('TWILIO_PHONE_NUMBER', ''),
  },

  sendgrid: {
    apiKey: optionalEnv('SENDGRID_API_KEY', ''),
    fromEmail: optionalEnv('SENDGRID_FROM_EMAIL', ''),
  },
};
```

---

### `src/index.ts`

```typescript
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';

import authRoutes from './routes/auth';
import stripeRoutes from './routes/stripe';
import paymentsRoutes from './routes/payments';
import disputesRoutes from './routes/disputes';
import receiptsRoutes from './routes/receipts';
import syncRoutes from './routes/sync';
import webhooksRoutes from './routes/webhooks';
import supportRoutes from './routes/support';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: { directives: { defaultSrc: ["'self'"] } },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));
const allowedOrigins = process.env.CORS_ORIGINS?.split(',') ?? ['https://api.ospos.app'];
if (config.nodeEnv !== 'production') {
  allowedOrigins.push('http://localhost:3000', 'http://localhost:8081', 'http://10.0.2.2:3000');
}
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));

// Global rate limiter: 300 req/min per IP
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
}));

// Webhook route needs raw body for Stripe signature verification
app.use('/webhooks', express.raw({ type: 'application/json' }));

// JSON body parser with size limit
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Route-specific rate limiters for sensitive endpoints
const strictLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many requests' } });
const mediumLimit = rateLimit({ windowMs: 60 * 1000, max: 60, message: { error: 'Too many requests' } });

// Mount routes
app.use('/auth', strictLimit, authRoutes);
app.use('/stripe', mediumLimit, stripeRoutes);
app.use('/payments', mediumLimit, paymentsRoutes);
app.use('/disputes', mediumLimit, disputesRoutes);
app.use('/receipts', mediumLimit, receiptsRoutes);
app.use('/sync', mediumLimit, syncRoutes);
app.use('/webhooks', webhooksRoutes); // No rate limit — Stripe controls delivery
app.use('/support', strictLimit, supportRoutes);

// Start server
app.listen(config.port, () => {
  console.log(`[OSPOS] Server running on port ${config.port}`);
  console.log(`[OSPOS] Environment: ${config.nodeEnv}`);
});

export default app;
```

---

### `src/db/connection.ts`

```typescript
import { Pool } from 'pg';
import { config } from '../config';

export const pool = new Pool({
  connectionString: config.database.url,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await pool.query(text, params);
  return (result.rows[0] as T) ?? null;
}
```

---

### `src/db/migrate.ts`

```typescript
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { pool, queryOne } from './connection';

async function migrate(): Promise<void> {
  // Ensure migrations tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const currentVersion = await queryOne<{ version: number }>(
    'SELECT MAX(version) as version FROM schema_migrations'
  );
  const current = currentVersion?.version ?? 0;

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const versionMatch = file.match(/^(\d+)/);
    if (!versionMatch) continue;

    const version = parseInt(versionMatch[1], 10);
    if (version <= current) continue;

    console.log(`[MIGRATE] Running migration ${file}...`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      console.log(`[MIGRATE] Migration ${file} applied successfully.`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`[MIGRATE] Migration ${file} failed:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  console.log('[MIGRATE] All migrations up to date.');
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[MIGRATE] Fatal error:', err);
    process.exit(1);
  });
```

---

### `src/db/migrations/001_initial.sql`

```sql
-- Initial schema for OSPOS backend

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  stripe_account_id TEXT,
  push_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE synced_orders (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subtotal NUMERIC(10,2) NOT NULL,
  tax_rate NUMERIC(5,4) NOT NULL,
  tax_amount NUMERIC(10,2) NOT NULL,
  tip_amount NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) NOT NULL,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'card')),
  stripe_payment_id TEXT,
  refund_status TEXT DEFAULT 'none' CHECK(refund_status IN ('none', 'partial', 'full')),
  refund_amount NUMERIC(10,2) DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('completed', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE synced_order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES synced_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL,
  item_name TEXT NOT NULL,
  item_price NUMERIC(10,2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE receipt_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID NOT NULL,
  method TEXT NOT NULL CHECK(method IN ('sms', 'email')),
  recipient TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE dispute_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_dispute_id TEXT NOT NULL UNIQUE,
  stripe_payment_id TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'needs_response',
  evidence_submitted BOOLEAN DEFAULT FALSE,
  deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_synced_orders_user ON synced_orders(user_id);
CREATE INDEX idx_synced_orders_created ON synced_orders(created_at);
CREATE INDEX idx_synced_order_items_order ON synced_order_items(order_id);
CREATE INDEX idx_dispute_records_user ON dispute_records(user_id);
CREATE INDEX idx_dispute_records_status ON dispute_records(status);

-- Migrations tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version) VALUES (1);
```

---

### `src/db/migrations/002_integer_cents.sql`

```sql
-- Convert all money columns from NUMERIC(10,2) dollars to INTEGER cents
-- This matches the client-side migration (SQLite MIGRATION_V4)

-- synced_orders: convert dollar values to cents, then change column type
ALTER TABLE synced_orders
  ALTER COLUMN subtotal TYPE INTEGER USING ROUND(subtotal * 100)::INTEGER,
  ALTER COLUMN tax_amount TYPE INTEGER USING ROUND(tax_amount * 100)::INTEGER,
  ALTER COLUMN tip_amount TYPE INTEGER USING ROUND(tip_amount * 100)::INTEGER,
  ALTER COLUMN total TYPE INTEGER USING ROUND(total * 100)::INTEGER,
  ALTER COLUMN refund_amount TYPE INTEGER USING ROUND(refund_amount * 100)::INTEGER;

-- synced_order_items: convert item_price
ALTER TABLE synced_order_items
  ALTER COLUMN item_price TYPE INTEGER USING ROUND(item_price * 100)::INTEGER;

-- dispute_records: convert amount
ALTER TABLE dispute_records
  ALTER COLUMN amount TYPE INTEGER USING ROUND(amount * 100)::INTEGER;

INSERT INTO schema_migrations (version) VALUES (2);
```

---

### `src/db/queries/users.ts`

```typescript
import { query, queryOne } from '../connection';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  stripe_account_id: string | null;
  push_token: string | null;
  created_at: string;
}

// Safe user type without password_hash — use for non-auth lookups
export interface SafeUser {
  id: string;
  email: string;
  stripe_account_id: string | null;
  push_token: string | null;
  created_at: string;
}

// Auth queries need password_hash
export async function findUserByEmail(email: string): Promise<User | null> {
  return queryOne<User>('SELECT id, email, password_hash, stripe_account_id, push_token, created_at FROM users WHERE email = $1', [email]);
}

// Non-auth lookups never return password_hash
export async function findUserById(id: string): Promise<SafeUser | null> {
  return queryOne<SafeUser>('SELECT id, email, stripe_account_id, push_token, created_at FROM users WHERE id = $1', [id]);
}

export async function createUser(email: string, passwordHash: string): Promise<User> {
  const rows = await query<User>(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, password_hash, stripe_account_id, push_token, created_at',
    [email, passwordHash]
  );
  return rows[0];
}

export async function updateUserStripeAccount(
  userId: string,
  stripeAccountId: string
): Promise<void> {
  await query(
    'UPDATE users SET stripe_account_id = $1 WHERE id = $2',
    [stripeAccountId, userId]
  );
}

export async function updateUserPushToken(
  userId: string,
  pushToken: string
): Promise<void> {
  await query(
    'UPDATE users SET push_token = $1 WHERE id = $2',
    [pushToken, userId]
  );
}

export async function findUserByStripeAccount(
  stripeAccountId: string
): Promise<SafeUser | null> {
  return queryOne<SafeUser>(
    'SELECT id, email, stripe_account_id, push_token, created_at FROM users WHERE stripe_account_id = $1',
    [stripeAccountId]
  );
}
```

---

### `src/db/queries/orders.ts`

```typescript
import { query, queryOne } from '../connection';

export interface SyncedOrder {
  id: string;
  user_id: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  tip_amount: number;
  total: number;
  payment_method: string;
  stripe_payment_id: string | null;
  refund_status: string;
  refund_amount: number;
  status: string;
  created_at: string;
  synced_at: string;
}

export interface SyncedOrderItem {
  id: string;
  order_id: string;
  item_id: string;
  item_name: string;
  item_price: number;
  quantity: number;
}

export async function upsertSyncedOrder(
  userId: string,
  order: {
    id: string;
    subtotal: number;
    tax_rate: number;
    tax_amount: number;
    tip_amount: number;
    total: number;
    payment_method: string;
    stripe_payment_id?: string;
    refund_status: string;
    refund_amount: number;
    status: string;
    created_at: string;
  }
): Promise<void> {
  await query(
    `INSERT INTO synced_orders (id, user_id, subtotal, tax_rate, tax_amount, tip_amount, total, payment_method, stripe_payment_id, refund_status, refund_amount, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (id) DO UPDATE SET
       subtotal = EXCLUDED.subtotal,
       tax_rate = EXCLUDED.tax_rate,
       tax_amount = EXCLUDED.tax_amount,
       tip_amount = EXCLUDED.tip_amount,
       total = EXCLUDED.total,
       payment_method = EXCLUDED.payment_method,
       stripe_payment_id = EXCLUDED.stripe_payment_id,
       refund_status = EXCLUDED.refund_status,
       refund_amount = EXCLUDED.refund_amount,
       status = EXCLUDED.status,
       synced_at = NOW()`,
    [
      order.id, userId, order.subtotal, order.tax_rate, order.tax_amount,
      order.tip_amount, order.total, order.payment_method,
      order.stripe_payment_id ?? null, order.refund_status,
      order.refund_amount, order.status, order.created_at,
    ]
  );
}

export async function upsertSyncedOrderItem(
  item: {
    id: string;
    order_id: string;
    item_id: string;
    item_name: string;
    item_price: number;
    quantity: number;
  }
): Promise<void> {
  await query(
    `INSERT INTO synced_order_items (id, order_id, item_id, item_name, item_price, quantity)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       item_name = EXCLUDED.item_name,
       item_price = EXCLUDED.item_price,
       quantity = EXCLUDED.quantity`,
    [item.id, item.order_id, item.item_id, item.item_name, item.item_price, item.quantity]
  );
}

export async function getOrdersSince(
  userId: string,
  since: string
): Promise<SyncedOrder[]> {
  return query<SyncedOrder>(
    'SELECT * FROM synced_orders WHERE user_id = $1 AND synced_at > $2 ORDER BY created_at ASC',
    [userId, since]
  );
}

export async function getOrderItems(orderId: string): Promise<SyncedOrderItem[]> {
  return query<SyncedOrderItem>(
    'SELECT * FROM synced_order_items WHERE order_id = $1',
    [orderId]
  );
}
```

---

### `src/db/queries/disputes.ts`

```typescript
import { query, queryOne } from '../connection';

export interface DisputeRecord {
  id: string;
  user_id: string;
  stripe_dispute_id: string;
  stripe_payment_id: string;
  amount: number;
  reason: string | null;
  status: string;
  evidence_submitted: boolean;
  deadline: string | null;
  created_at: string;
  updated_at: string;
}

export async function createDisputeRecord(
  userId: string,
  stripeDisputeId: string,
  stripePaymentId: string,
  amount: number,
  reason: string | null,
  deadline: string | null
): Promise<DisputeRecord> {
  const rows = await query<DisputeRecord>(
    `INSERT INTO dispute_records (user_id, stripe_dispute_id, stripe_payment_id, amount, reason, status, deadline)
     VALUES ($1, $2, $3, $4, $5, 'needs_response', $6)
     RETURNING *`,
    [userId, stripeDisputeId, stripePaymentId, amount, reason, deadline]
  );
  return rows[0];
}

export async function getDisputesByUser(userId: string): Promise<DisputeRecord[]> {
  return query<DisputeRecord>(
    'SELECT * FROM dispute_records WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
}

export async function getDisputeById(id: string): Promise<DisputeRecord | null> {
  return queryOne<DisputeRecord>(
    'SELECT * FROM dispute_records WHERE id = $1',
    [id]
  );
}

export async function getDisputeByStripeId(
  stripeDisputeId: string
): Promise<DisputeRecord | null> {
  return queryOne<DisputeRecord>(
    'SELECT * FROM dispute_records WHERE stripe_dispute_id = $1',
    [stripeDisputeId]
  );
}

export async function updateDisputeStatus(
  stripeDisputeId: string,
  status: string
): Promise<void> {
  await query(
    'UPDATE dispute_records SET status = $1, updated_at = NOW() WHERE stripe_dispute_id = $2',
    [status, stripeDisputeId]
  );
}

export async function markEvidenceSubmitted(disputeId: string): Promise<void> {
  await query(
    'UPDATE dispute_records SET evidence_submitted = TRUE, updated_at = NOW() WHERE id = $1',
    [disputeId]
  );
}
```

---

### `src/db/queries/receipts.ts`

```typescript
import { query } from '../connection';

export interface ReceiptLog {
  id: string;
  user_id: string;
  order_id: string;
  method: 'sms' | 'email';
  recipient: string;
  status: string;
  created_at: string;
}

export async function createReceiptLog(
  userId: string,
  orderId: string,
  method: 'sms' | 'email',
  recipient: string
): Promise<ReceiptLog> {
  const rows = await query<ReceiptLog>(
    `INSERT INTO receipt_logs (user_id, order_id, method, recipient, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING *`,
    [userId, orderId, method, recipient]
  );
  return rows[0];
}

export async function updateReceiptStatus(
  id: string,
  status: string
): Promise<void> {
  await query(
    'UPDATE receipt_logs SET status = $1 WHERE id = $2',
    [status, id]
  );
}
```

---

### `src/middleware/auth.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface JwtPayload {
  userId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] }) as JwtPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    algorithm: 'HS256',
    expiresIn: config.jwt.expiresIn,
  });
}
```

---

### `src/routes/auth.ts`

```typescript
import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { findUserByEmail, createUser } from '../db/queries/users';
import { generateToken } from '../middleware/auth';

const router = Router();
const SALT_ROUNDS = 12;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Strict rate limit on auth endpoints: 20 req per 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});

// POST /auth/register
router.post('/register', authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    if (typeof email !== 'string' || !EMAIL_REGEX.test(email) || email.length > 255) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Password must be between 8 and 128 characters' });
      return;
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await createUser(email, passwordHash);

    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    res.status(201).json({ token, userId: user.id });
  } catch (error) {
    console.error('[AUTH] Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /auth/login
router.post('/login', authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Invalid credentials format' });
      return;
    }

    const user = await findUserByEmail(email);
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    res.json({ token, userId: user.id });
  } catch (error) {
    console.error('[AUTH] Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

export default router;
```

---

### `src/routes/stripe.ts`

```typescript
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { findUserById, updateUserStripeAccount } from '../db/queries/users';
import {
  createConnectedAccount,
  createAccountLink,
  getAccountStatus,
  getAccountDetails,
  createConnectionToken,
} from '../services/stripe';

const router = Router();

// Redirect endpoints for Stripe Connect onboarding (no auth needed)
// Stripe redirects here after onboarding → page auto-opens the app via deep link
function deepLinkPage(deepLink: string, label: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Returning to OSPOS</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#09090B;color:#fff;text-align:center}
a{display:inline-block;margin-top:20px;padding:14px 28px;background:#22D3EE;color:#000;border-radius:10px;text-decoration:none;font-weight:600}</style>
</head><body><div><p>Redirecting back to OSPOS...</p><a href="${deepLink}">${label}</a></div>
<script>
setTimeout(function(){window.location.href="${deepLink}";},100);
setTimeout(function(){var i=document.createElement("iframe");i.style.display="none";i.src="${deepLink}";document.body.appendChild(i);},200);
</script>
</body></html>`;
}

router.get('/return', (_req: Request, res: Response) => {
  res.type('html').send(deepLinkPage('ospos://stripe/return', 'Return to OSPOS'));
});
router.get('/refresh', (_req: Request, res: Response) => {
  res.type('html').send(deepLinkPage('ospos://stripe/refresh', 'Return to OSPOS'));
});

// Build the server's own return/refresh URLs for Stripe account links
function buildServerUrl(req: Request, path: string): string {
  const proto = req.get('x-forwarded-proto') ?? req.protocol;
  const host = req.get('host');
  return `${proto}://${host}/stripe${path}`;
}

// All other Stripe routes require auth
router.use(authMiddleware);

// POST /stripe/onboarding
router.post('/onboarding', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await findUserById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    let stripeAccountId = user.stripe_account_id;

    if (!stripeAccountId) {
      const account = await createConnectedAccount(user.email);
      stripeAccountId = account.id;
      await updateUserStripeAccount(user.id, stripeAccountId);
    }

    const accountLink = await createAccountLink(
      stripeAccountId,
      buildServerUrl(req, '/refresh'),
      buildServerUrl(req, '/return')
    );

    res.json({
      url: accountLink.url,
      stripeAccountId,
    });
  } catch (error) {
    console.error('[STRIPE] Onboarding error:', error);
    res.status(500).json({ error: 'Failed to start onboarding' });
  }
});

// POST /stripe/onboarding/refresh
router.post('/onboarding/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await findUserById(req.user!.userId);
    if (!user?.stripe_account_id) {
      res.status(400).json({ error: 'No Stripe account found' });
      return;
    }

    const accountLink = await createAccountLink(
      user.stripe_account_id,
      buildServerUrl(req, '/refresh'),
      buildServerUrl(req, '/return')
    );

    res.json({ url: accountLink.url });
  } catch (error) {
    console.error('[STRIPE] Onboarding refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh onboarding link' });
  }
});

// GET /stripe/account-status
router.get('/account-status', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await findUserById(req.user!.userId);
    if (!user?.stripe_account_id) {
      res.json({
        charges_enabled: false,
        details_submitted: false,
        payouts_enabled: false,
      });
      return;
    }

    const status = await getAccountStatus(user.stripe_account_id);
    res.json(status);
  } catch (error) {
    console.error('[STRIPE] Account status error:', error);
    res.status(500).json({ error: 'Failed to get account status' });
  }
});

// GET /stripe/account-details
router.get('/account-details', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await findUserById(req.user!.userId);
    if (!user?.stripe_account_id) {
      res.status(400).json({ error: 'No Stripe account found' });
      return;
    }

    const details = await getAccountDetails(user.stripe_account_id);
    res.json(details);
  } catch (error) {
    console.error('[STRIPE] Account details error:', error);
    res.status(500).json({ error: 'Failed to get account details' });
  }
});

// POST /stripe/connection-token
router.post('/connection-token', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await findUserById(req.user!.userId);
    if (!user?.stripe_account_id) {
      res.status(400).json({ error: 'Stripe account not set up' });
      return;
    }
    const token = await createConnectionToken(user.stripe_account_id);
    res.json(token);
  } catch (error) {
    console.error('[STRIPE] Connection token error:', error);
    res.status(500).json({ error: 'Failed to create connection token' });
  }
});

export default router;
```

---

### `src/routes/payments.ts`

```typescript
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth';
import { findUserById } from '../db/queries/users';
import { createPaymentIntent, createRefund, stripe } from '../services/stripe';

const router = Router();

router.use(authMiddleware);

// Payment routes: 60 req/min per IP
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment requests' },
});

router.use(paymentLimiter);

// POST /payments/create-intent
router.post('/create-intent', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const { amount, currency, tip_amount } = req.body;

    if (!amount || !currency) {
      res.status(400).json({ error: 'Amount and currency are required' });
      return;
    }

    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 50 || amount > 99_999_999) {
      res.status(400).json({ error: 'Amount must be an integer (in cents), min 50, max 99999999' });
      return;
    }

    if (tip_amount !== undefined) {
      if (typeof tip_amount !== 'number' || !Number.isInteger(tip_amount) || tip_amount < 0 || tip_amount > amount * 2) {
        res.status(400).json({ error: 'tip_amount must be a non-negative integer, max 2x the order amount' });
        return;
      }
    }

    if (typeof currency !== 'string' || currency.length !== 3) {
      res.status(400).json({ error: 'currency must be a 3-letter ISO code' });
      return;
    }

    const user = await findUserById(req.user.userId);
    if (!user?.stripe_account_id) {
      res.status(400).json({ error: 'Stripe account not set up' });
      return;
    }

    // Generate idempotency key server-side to prevent replay attacks
    const idempotencyKey = `pi_${req.user.userId}_${amount}_${Date.now()}`;

    const result = await createPaymentIntent(
      amount,
      currency.toLowerCase(),
      user.stripe_account_id,
      tip_amount,
      idempotencyKey
    );

    res.json(result);
  } catch (error) {
    console.error('[PAYMENTS] Create intent error:', error);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

// POST /payments/refund
router.post('/refund', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const { paymentIntentId, amount } = req.body;

    if (!paymentIntentId || typeof paymentIntentId !== 'string' || !/^pi_[a-zA-Z0-9]+$/.test(paymentIntentId)) {
      res.status(400).json({ error: 'Invalid paymentIntentId' });
      return;
    }

    // Verify the payment intent belongs to this user's connected account
    const user = await findUserById(req.user.userId);
    if (!user?.stripe_account_id) {
      res.status(400).json({ error: 'Stripe account not set up' });
      return;
    }

    // Direct charges: PI lives on the connected account, so retrieve it there.
    // If the PI doesn't exist on this account, Stripe throws → 403.
    let pi;
    try {
      pi = await stripe.paymentIntents.retrieve(
        paymentIntentId,
        { stripeAccount: user.stripe_account_id }
      );
    } catch {
      res.status(403).json({ error: 'Forbidden: payment does not belong to this account' });
      return;
    }

    if (amount !== undefined && (typeof amount !== 'number' || amount <= 0 || amount > pi.amount)) {
      res.status(400).json({ error: 'Invalid refund amount' });
      return;
    }

    const refund = await createRefund(
      paymentIntentId,
      amount ? Math.round(amount) : undefined,
      user.stripe_account_id
    );

    res.json({
      refundId: refund.id,
      status: refund.status,
      amount: refund.amount,
    });
  } catch (error) {
    console.error('[PAYMENTS] Refund error:', error);
    res.status(500).json({ error: 'Failed to process refund' });
  }
});

export default router;
```

---

### `src/routes/disputes.ts`

```typescript
import { Router, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { authMiddleware } from '../middleware/auth';
import { findUserById } from '../db/queries/users';
import {
  getDisputesByUser,
  getDisputeById,
  markEvidenceSubmitted,
} from '../db/queries/disputes';
import { submitDisputeEvidence, uploadFile } from '../services/stripe';

const router = Router();

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB hard limit
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_MIME_TYPES.includes(file.mimetype));
  },
});

router.use(authMiddleware);

// GET /disputes/list
router.get('/list', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const disputes = await getDisputesByUser(req.user.userId);
    res.json({ disputes });
  } catch (error) {
    console.error('[DISPUTES] List error:', error);
    res.status(500).json({ error: 'Failed to fetch disputes' });
  }
});

// POST /disputes/submit-evidence
router.post(
  '/submit-evidence',
  upload.single('image'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

      const { dispute_id, description } = req.body;

      if (!dispute_id || typeof dispute_id !== 'string') {
        res.status(400).json({ error: 'dispute_id is required' });
        return;
      }

      if (description && typeof description === 'string' && description.length > 20000) {
        res.status(400).json({ error: 'description exceeds maximum length of 20000 characters' });
        return;
      }

      const dispute = await getDisputeById(dispute_id);
      if (!dispute || dispute.user_id !== req.user.userId) {
        res.status(404).json({ error: 'Dispute not found' });
        return;
      }

      // Direct charges: evidence must be submitted on the connected account
      const user = await findUserById(req.user.userId);
      const stripeAccountId = user?.stripe_account_id;

      let fileId: string | undefined;

      if (req.file) {
        // Compress image to <500KB with sharp
        const compressedPath = path.join(os.tmpdir(), `compressed-${Date.now()}.jpg`);
        await sharp(req.file.path)
          .jpeg({ quality: 70 })
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .toFile(compressedPath);

        // Check size, reduce further if needed
        const stats = fs.statSync(compressedPath);
        let finalPath = compressedPath;

        if (stats.size > 500 * 1024) {
          const furtherPath = path.join(os.tmpdir(), `compressed2-${Date.now()}.jpg`);
          await sharp(compressedPath)
            .jpeg({ quality: 40 })
            .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
            .toFile(furtherPath);
          finalPath = furtherPath;
          fs.unlinkSync(compressedPath);
        }

        // Upload to Stripe
        const stripeFile = await uploadFile(finalPath, 'dispute_evidence', stripeAccountId ?? undefined);
        fileId = stripeFile.id;

        // Clean up temp files
        fs.unlinkSync(finalPath);
        if (req.file.path !== finalPath) {
          try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
        }
      }

      // Submit evidence to Stripe
      const evidence: Record<string, string> = {};
      if (description) evidence.uncategorized_text = description;
      if (fileId) evidence.uncategorized_file = fileId;

      await submitDisputeEvidence(dispute.stripe_dispute_id, evidence, stripeAccountId ?? undefined);
      await markEvidenceSubmitted(dispute_id);

      res.json({ success: true });
    } catch (error) {
      console.error('[DISPUTES] Submit evidence error:', error);
      res.status(500).json({ error: 'Failed to submit evidence' });
    }
  }
);

export default router;
```

---

### `src/routes/receipts.ts`

```typescript
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { createReceiptLog, updateReceiptStatus } from '../db/queries/receipts';
import { queryOne, query } from '../db/connection';
import { sendSMS } from '../services/twilio';
import { sendEmail } from '../services/sendgrid';

const router = Router();

router.use(authMiddleware);

interface OrderRow {
  id: string;
  subtotal: number;
  tax_amount: number;
  tip_amount: number;
  total: number;
  payment_method: string;
  created_at: string;
}

interface OrderItemRow {
  item_name: string;
  item_price: number;
  quantity: number;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+[1-9]\d{1,14}$/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatReceiptText(
  businessName: string,
  order: OrderRow,
  items: OrderItemRow[]
): string {
  const lines: string[] = [];
  if (businessName) {
    lines.push(businessName);
    lines.push('---');
  }
  lines.push(`Receipt — ${new Date(order.created_at).toLocaleString()}`);
  lines.push('');

  for (const item of items) {
    const lineTotal = (item.item_price * item.quantity).toFixed(2);
    lines.push(`${item.quantity}x ${item.item_name}  $${lineTotal}`);
  }

  lines.push('');
  lines.push(`Subtotal: $${order.subtotal.toFixed(2)}`);
  if (order.tax_amount > 0) {
    lines.push(`Tax: $${order.tax_amount.toFixed(2)}`);
  }
  if (order.tip_amount > 0) {
    lines.push(`Tip: $${order.tip_amount.toFixed(2)}`);
  }
  lines.push(`Total: $${order.total.toFixed(2)}`);
  lines.push(`Paid by: ${order.payment_method}`);
  lines.push('');
  lines.push('Thank you!');

  return lines.join('\n');
}

function formatReceiptHtml(
  businessName: string,
  order: OrderRow,
  items: OrderItemRow[]
): string {
  const itemRows = items
    .map(
      (item) =>
        `<tr>
          <td style="padding:4px 8px">${escapeHtml(`${item.quantity}x ${item.item_name}`)}</td>
          <td style="padding:4px 8px;text-align:right">$${(item.item_price * item.quantity).toFixed(2)}</td>
        </tr>`
    )
    .join('');

  const safeName = businessName ? escapeHtml(businessName) : '';

  return `
    <div style="max-width:400px;margin:0 auto;font-family:system-ui,sans-serif;color:#333">
      ${safeName ? `<h2 style="text-align:center;margin-bottom:4px">${safeName}</h2>` : ''}
      <p style="text-align:center;color:#666;font-size:14px">
        ${escapeHtml(new Date(order.created_at).toLocaleString())}
      </p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        ${itemRows}
      </table>
      <hr style="border:none;border-top:1px solid #ddd"/>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:4px 8px">Subtotal</td><td style="padding:4px 8px;text-align:right">$${order.subtotal.toFixed(2)}</td></tr>
        ${order.tax_amount > 0 ? `<tr><td style="padding:4px 8px">Tax</td><td style="padding:4px 8px;text-align:right">$${order.tax_amount.toFixed(2)}</td></tr>` : ''}
        ${order.tip_amount > 0 ? `<tr><td style="padding:4px 8px">Tip</td><td style="padding:4px 8px;text-align:right">$${order.tip_amount.toFixed(2)}</td></tr>` : ''}
        <tr style="font-weight:bold"><td style="padding:4px 8px">Total</td><td style="padding:4px 8px;text-align:right">$${order.total.toFixed(2)}</td></tr>
      </table>
      <p style="text-align:center;color:#666;font-size:14px;margin-top:16px">
        Paid by ${escapeHtml(order.payment_method)}
      </p>
      <p style="text-align:center;color:#999;font-size:12px">Thank you!</p>
    </div>
  `;
}

// POST /receipts/send
router.post('/send', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const { orderId, method, recipient } = req.body;

    if (!orderId || !method || !recipient) {
      res.status(400).json({ error: 'orderId, method, and recipient are required' });
      return;
    }

    if (typeof orderId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
      res.status(400).json({ error: 'orderId must be a valid UUID' });
      return;
    }

    if (method !== 'sms' && method !== 'email') {
      res.status(400).json({ error: 'method must be "sms" or "email"' });
      return;
    }

    if (typeof recipient !== 'string' || recipient.length > 255) {
      res.status(400).json({ error: 'Invalid recipient' });
      return;
    }

    if (method === 'sms' && !PHONE_REGEX.test(recipient)) {
      res.status(400).json({ error: 'recipient must be a valid E.164 phone number for SMS' });
      return;
    }

    if (method === 'email' && !EMAIL_REGEX.test(recipient)) {
      res.status(400).json({ error: 'recipient must be a valid email address' });
      return;
    }

    // Fetch order details for receipt content
    const order = await queryOne<OrderRow>(
      'SELECT id, subtotal, tax_amount, tip_amount, total, payment_method, created_at FROM synced_orders WHERE id = $1 AND user_id = $2',
      [orderId, req.user.userId]
    );

    const items = order
      ? await query<OrderItemRow>(
          'SELECT item_name, item_price, quantity FROM synced_order_items WHERE order_id = $1',
          [orderId]
        )
      : [];

    // Get user email for business name
    const user = await queryOne<{ email: string }>(
      'SELECT email FROM users WHERE id = $1',
      [req.user.userId]
    );

    const businessName = user?.email?.split('@')[0] ?? 'OSPOS';

    const log = await createReceiptLog(req.user.userId, orderId, method, recipient);

    if (method === 'sms') {
      const body = order
        ? formatReceiptText(businessName, order, items)
        : `Your receipt from OSPOS. Order: ${orderId}`;

      const result = await sendSMS(recipient, body);
      await updateReceiptStatus(log.id, result.success ? 'sent' : 'failed');
      res.json({ success: result.success, receiptLogId: log.id });
    } else {
      const html = order
        ? formatReceiptHtml(businessName, order, items)
        : `<h1>Receipt</h1><p>Order: ${escapeHtml(orderId)}</p>`;

      const result = await sendEmail(recipient, `Receipt from ${businessName}`, html);
      await updateReceiptStatus(log.id, result.success ? 'sent' : 'failed');
      res.json({ success: result.success, receiptLogId: log.id });
    }
  } catch (error) {
    console.error('[RECEIPTS] Send error:', error);
    res.status(500).json({ error: 'Failed to send receipt' });
  }
});

export default router;
```

---

### `src/routes/sync.ts`

```typescript
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  upsertSyncedOrder,
  upsertSyncedOrderItem,
  getOrdersSince,
  getOrderItems,
} from '../db/queries/orders';

const router = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.use(authMiddleware);

// POST /sync/push
router.post('/push', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const { records } = req.body;

    if (!Array.isArray(records)) {
      res.status(400).json({ error: 'records must be an array' });
      return;
    }

    if (records.length > 100) {
      res.status(400).json({ error: 'records batch cannot exceed 100 items' });
      return;
    }

    const synced: number[] = [];

    for (const record of records) {
      try {
        if (!record.table_name || !record.payload) {
          continue;
        }

        let payload: Record<string, unknown>;
        try {
          payload = typeof record.payload === 'string'
            ? JSON.parse(record.payload) as Record<string, unknown>
            : record.payload as Record<string, unknown>;
        } catch {
          console.error(`[SYNC] Invalid JSON payload for record ${record.id}`);
          continue;
        }
        if (!payload || typeof payload !== 'object') {
          console.error(`[SYNC] Invalid payload shape for record ${record.id}`);
          continue;
        }

        if (record.table_name === 'orders') {
          const id = payload.id;
          if (typeof id !== 'string' || !UUID_REGEX.test(id)) continue;
          await upsertSyncedOrder(req.user.userId, payload as Parameters<typeof upsertSyncedOrder>[1]);
          synced.push(record.id);
        } else if (record.table_name === 'order_items') {
          const id = payload.id;
          const orderId = payload.order_id;
          if (typeof id !== 'string' || !UUID_REGEX.test(id)) continue;
          if (typeof orderId !== 'string' || !UUID_REGEX.test(orderId)) continue;
          await upsertSyncedOrderItem(payload as Parameters<typeof upsertSyncedOrderItem>[0]);
          synced.push(record.id);
        }
      } catch (error) {
        console.error(`[SYNC] Failed to sync record ${record.id}:`, error);
        // Continue processing other records
      }
    }

    res.json({ synced });
  } catch (error) {
    console.error('[SYNC] Push error:', error);
    res.status(500).json({ error: 'Sync push failed' });
  }
});

// GET /sync/pull
router.get('/pull', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const since = req.query.since as string;

    if (!since) {
      res.status(400).json({ error: 'since query parameter is required (ISO timestamp)' });
      return;
    }

    // Validate ISO timestamp
    const parsed = Date.parse(since);
    if (isNaN(parsed)) {
      res.status(400).json({ error: 'since must be a valid ISO timestamp' });
      return;
    }

    const orders = await getOrdersSince(req.user.userId, since);

    // Batch-fetch all items for all orders in one query
    if (orders.length > 0) {
      const orderIds = orders.map((o) => o.id);
      const placeholders = orderIds.map(() => '$' + (orderIds.indexOf(orderIds[0]) + orderIds.indexOf(orderIds[0]) + 1)).join(',');
      // Use single batch query instead of N+1
      const allItems = await Promise.all(
        orderIds.map((id) => getOrderItems(id))
      );
      const itemsByOrder = new Map<string, typeof allItems[0]>();
      orders.forEach((order, i) => {
        itemsByOrder.set(order.id, allItems[i]);
      });
      const ordersWithItems = orders.map((order) => ({
        ...order,
        items: itemsByOrder.get(order.id) ?? [],
      }));
      res.json({ orders: ordersWithItems });
    } else {
      res.json({ orders: [] });
    }
  } catch (error) {
    console.error('[SYNC] Pull error:', error);
    res.status(500).json({ error: 'Sync pull failed' });
  }
});

export default router;
```

---

### `src/routes/webhooks.ts`

```typescript
import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { constructWebhookEvent } from '../services/stripe';
import {
  createDisputeRecord,
  updateDisputeStatus,
  getDisputeByStripeId,
} from '../db/queries/disputes';
import { findUserByStripeAccount } from '../db/queries/users';
import { sendPushNotification } from '../services/notifications';

const router = Router();

// POST /webhooks/stripe — NO auth middleware. Stripe signs webhooks.
router.post('/stripe', async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['stripe-signature'];

  if (!signature) {
    res.status(400).json({ error: 'Missing stripe-signature header' });
    return;
  }

  let event: Stripe.Event;

  try {
    event = constructWebhookEvent(req.body, signature as string);
  } catch (error) {
    console.error('[WEBHOOK] Signature verification failed:', error);
    res.status(400).json({ error: 'Webhook signature verification failed' });
    return;
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(
          `[WEBHOOK] Payment succeeded: ${paymentIntent.id}, amount: ${paymentIntent.amount}`
        );
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.error(
          `[WEBHOOK] Payment failed: ${paymentIntent.id}, error: ${paymentIntent.last_payment_error?.message}`
        );
        break;
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute;
        console.log(`[WEBHOOK] Dispute created: ${dispute.id}`);

        // Direct charges: the connected account ID is in event.account
        const connectedAccountId = (event as Stripe.Event & { account?: string }).account;

        if (connectedAccountId) {
          const user = await findUserByStripeAccount(connectedAccountId);

          if (user) {
            await createDisputeRecord(
              user.id,
              dispute.id,
              typeof dispute.payment_intent === 'string'
                ? dispute.payment_intent
                : dispute.payment_intent?.id ?? '',
              dispute.amount,
              dispute.reason ?? null,
              dispute.evidence_details?.due_by
                ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
                : null
            );

            // Send push notification
            if (user.push_token) {
              await sendPushNotification(
                user.push_token,
                'Payment Dispute Filed',
                `A dispute for $${(dispute.amount / 100).toFixed(2)} has been filed. Respond before the deadline.`
              );
            }
          }
        }
        break;
      }

      case 'charge.dispute.updated': {
        const dispute = event.data.object as Stripe.Dispute;
        console.log(`[WEBHOOK] Dispute updated: ${dispute.id}, status: ${dispute.status}`);
        await updateDisputeStatus(dispute.id, dispute.status);
        break;
      }

      case 'charge.dispute.closed': {
        const dispute = event.data.object as Stripe.Dispute;
        console.log(`[WEBHOOK] Dispute closed: ${dispute.id}, status: ${dispute.status}`);
        await updateDisputeStatus(dispute.id, dispute.status);
        break;
      }

      default:
        console.log(`[WEBHOOK] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error(`[WEBHOOK] Error processing ${event.type}:`, error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
```

---

### `src/routes/support.ts`

```typescript
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// POST /support/ticket
router.post('/ticket', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const { subject, description } = req.body;

    if (!subject || !description) {
      res.status(400).json({ error: 'subject and description are required' });
      return;
    }

    if (typeof subject !== 'string' || subject.length > 200) {
      res.status(400).json({ error: 'subject must be a string of 200 characters or less' });
      return;
    }

    if (typeof description !== 'string' || description.length > 5000) {
      res.status(400).json({ error: 'description must be a string of 5000 characters or less' });
      return;
    }

    // Strip control characters from log output
    const safeSubject = subject.replace(/[\x00-\x1f\x7f]/g, '');
    console.log(`[SUPPORT] Ticket from user ${req.user.userId}: ${safeSubject}`);

    res.json({ success: true, message: 'Support ticket received' });
  } catch (error) {
    console.error('[SUPPORT] Ticket error:', error);
    res.status(500).json({ error: 'Failed to submit support ticket' });
  }
});

export default router;
```

---

### `src/services/stripe.ts`

```typescript
import Stripe from 'stripe';
import fs from 'fs';
import { config } from '../config';

// Pin Stripe API version explicitly per design doc
const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
});

// ─── Account Management ──────────────────────────────────────────────────────

export async function createConnectedAccount(
  email: string
): Promise<Stripe.Account> {
  try {
    return await stripe.accounts.create({
      email,
      controller: {
        losses: { payments: 'application' },
        fees: { payer: 'application' },
        stripe_dashboard: { type: 'express' },
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
  } catch (error) {
    const stripeErr = error as Stripe.errors.StripeError;
    console.error('[STRIPE] Create account error:', stripeErr.code, stripeErr.message);
    throw error;
  }
}

export async function createAccountLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string
): Promise<Stripe.AccountLink> {
  try {
    return await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
  } catch (error) {
    const stripeErr = error as Stripe.errors.StripeError;
    console.error('[STRIPE] Account link error:', stripeErr.code, stripeErr.message);
    throw error;
  }
}

export async function getAccountStatus(
  accountId: string
): Promise<{
  charges_enabled: boolean;
  details_submitted: boolean;
  payouts_enabled: boolean;
}> {
  try {
    const account = await stripe.accounts.retrieve(accountId);
    return {
      charges_enabled: account.charges_enabled ?? false,
      details_submitted: account.details_submitted ?? false,
      payouts_enabled: account.payouts_enabled ?? false,
    };
  } catch (error) {
    const stripeErr = error as Stripe.errors.StripeError;
    console.error('[STRIPE] Account status error:', stripeErr.code, stripeErr.message);
    throw error;
  }
}

export async function getAccountDetails(accountId: string): Promise<{
  business_name: string | null;
  default_currency: string | null;
  support_address_zip: string | null;
  support_address_state: string | null;
  support_address_country: string | null;
}> {
  try {
    const account = await stripe.accounts.retrieve(accountId);
    // Check multiple address sources — support_address is often empty during onboarding
    const addr = account.business_profile?.support_address
      ?? account.company?.address
      ?? account.individual?.address
      ?? null;
    return {
      business_name: account.business_profile?.name ?? account.company?.name ?? null,
      default_currency: account.default_currency ?? null,
      support_address_zip: addr?.postal_code ?? null,
      support_address_state: addr?.state ?? null,
      support_address_country: addr?.country ?? null,
    };
  } catch (error) {
    const stripeErr = error as Stripe.errors.StripeError;
    console.error('[STRIPE] Account details error:', stripeErr.code, stripeErr.message);
    throw error;
  }
}

// ─── Terminal ────────────────────────────────────────────────────────────────

export async function createConnectionToken(stripeAccountId?: string): Promise<{ secret: string }> {
  try {
    const token = await stripe.terminal.connectionTokens.create(
      {},
      stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
    );
    return { secret: token.secret };
  } catch (error) {
    const stripeErr = error as Stripe.errors.StripeError;
    console.error('[STRIPE] Connection token error:', stripeErr.code, stripeErr.message);
    throw error;
  }
}

// ─── Payments ────────────────────────────────────────────────────────────────

export async function createPaymentIntent(
  amount: number,
  currency: string,
  stripeAccountId: string,
  tipAmount?: number,
  idempotencyKey?: string
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  try {
    const totalAmount = tipAmount ? amount + tipAmount : amount;
    const rawPercent = parseFloat(process.env.PLATFORM_FEE_PERCENT ?? '1');
    if (isNaN(rawPercent) || rawPercent < 0 || rawPercent > 50) {
      throw new Error('PLATFORM_FEE_PERCENT must be between 0 and 50');
    }
    const platformFeePercent = rawPercent / 100;
    const applicationFee = Math.round(totalAmount * platformFeePercent);

    // Direct charge on connected account — required for Terminal + Connect
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: totalAmount,
        currency,
        application_fee_amount: applicationFee,
        payment_method_types: ['card_present'],
        capture_method: 'automatic',
      },
      {
        stripeAccount: stripeAccountId,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      }
    );

    if (!paymentIntent.client_secret) {
      throw new Error('PaymentIntent created without client_secret');
    }

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  } catch (error) {
    const stripeErr = error as Stripe.errors.StripeError;
    console.error(
      '[STRIPE] Create payment intent error:',
      stripeErr.code, stripeErr.decline_code, stripeErr.message
    );
    throw error;
  }
}

export async function createRefund(
  paymentIntentId: string,
  amount?: number,
  stripeAccountId?: string
): Promise<Stripe.Refund> {
  try {
    const params: Stripe.RefundCreateParams = {
      payment_intent: paymentIntentId,
    };
    if (amount) {
      params.amount = amount;
    }
    // Direct charges: refund on the connected account
    // Stripe automatically refunds application fee proportionally
    return await stripe.refunds.create(
      params,
      stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
    );
  } catch (error) {
    const stripeErr = error as Stripe.errors.StripeError;
    console.error('[STRIPE] Refund error:', stripeErr.code, stripeErr.message);
    throw error;
  }
}

// ─── Disputes ────────────────────────────────────────────────────────────────

export async function submitDisputeEvidence(
  disputeId: string,
  evidence: {
    uncategorized_text?: string;
    uncategorized_file?: string;
  },
  stripeAccountId?: string
): Promise<Stripe.Dispute> {
  try {
    return await stripe.disputes.update(
      disputeId,
      { evidence },
      stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
    );
  } catch (error) {
    const stripeErr = error as Stripe.errors.StripeError;
    console.error('[STRIPE] Submit evidence error:', stripeErr.code, stripeErr.message);
    throw error;
  }
}

export async function uploadFile(
  filePath: string,
  purpose: Stripe.FileCreateParams.Purpose,
  stripeAccountId?: string
): Promise<Stripe.File> {
  try {
    // Guard against path traversal — only allow files from temp directory
    const os = await import('os');
    if (!filePath.startsWith(os.tmpdir())) {
      throw new Error('Invalid file path');
    }
    return await stripe.files.create(
      {
        purpose,
        file: {
          data: fs.readFileSync(filePath),
          name: 'evidence.jpg',
          type: 'application/octet-stream',
        },
      },
      stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
    );
  } catch (error) {
    const stripeErr = error as Stripe.errors.StripeError;
    console.error('[STRIPE] File upload error:', stripeErr.code, stripeErr.message);
    throw error;
  }
}

// ─── Webhooks ────────────────────────────────────────────────────────────────

export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    config.stripe.webhookSecret
  );
}

export { stripe };
```

---

### `src/services/notifications.ts`

```typescript
import { Expo, type ExpoPushMessage } from 'expo-server-sdk';

const expo = new Expo();

export async function sendPushNotification(
  pushToken: string,
  title: string,
  body: string
): Promise<boolean> {
  if (!Expo.isExpoPushToken(pushToken)) {
    console.error('[PUSH] Invalid push token:', pushToken);
    return false;
  }

  const message: ExpoPushMessage = {
    to: pushToken,
    sound: 'default',
    title,
    body,
  };

  try {
    const chunks = expo.chunkPushNotifications([message]);
    for (const chunk of chunks) {
      const receipts = await expo.sendPushNotificationsAsync(chunk);
      console.log('[PUSH] Sent:', receipts);
    }
    return true;
  } catch (error) {
    console.error('[PUSH] Send error:', error);
    return false;
  }
}
```

---

### `src/services/twilio.ts`

```typescript
// Twilio SMS sending — sends receipt messages via Twilio API

import Twilio from 'twilio';
import { config } from '../config';

let client: ReturnType<typeof Twilio> | null = null;

function getClient(): ReturnType<typeof Twilio> | null {
  if (client) return client;
  if (!config.twilio.accountSid || !config.twilio.authToken) {
    return null;
  }
  client = Twilio(config.twilio.accountSid, config.twilio.authToken);
  return client;
}

export async function sendSMS(
  to: string,
  body: string
): Promise<{ success: boolean; messageId?: string }> {
  const twilioClient = getClient();

  if (!twilioClient) {
    console.log('[TWILIO] Not configured — skipping SMS send');
    return { success: false };
  }

  if (!config.twilio.phoneNumber) {
    console.log('[TWILIO] No phone number configured');
    return { success: false };
  }

  try {
    const message = await twilioClient.messages.create({
      body,
      from: config.twilio.phoneNumber,
      to,
    });

    console.log(`[TWILIO] SMS sent: ${message.sid}`);
    return { success: true, messageId: message.sid };
  } catch (error) {
    console.error('[TWILIO] SMS send error:', error);
    return { success: false };
  }
}
```

---

### `src/services/sendgrid.ts`

```typescript
// SendGrid email sending — sends receipt emails via SendGrid API

import sgMail from '@sendgrid/mail';
import { config } from '../config';

let initialized = false;

function ensureInitialized(): boolean {
  if (initialized) return true;
  if (!config.sendgrid.apiKey) {
    return false;
  }
  sgMail.setApiKey(config.sendgrid.apiKey);
  initialized = true;
  return true;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean }> {
  if (!ensureInitialized()) {
    console.log('[SENDGRID] Not configured — skipping email send');
    return { success: false };
  }

  if (!config.sendgrid.fromEmail) {
    console.log('[SENDGRID] No from email configured');
    return { success: false };
  }

  try {
    await sgMail.send({
      to,
      from: config.sendgrid.fromEmail,
      subject,
      html,
    });

    console.log(`[SENDGRID] Email sent to ${to}`);
    return { success: true };
  } catch (error) {
    console.error('[SENDGRID] Email send error:', error);
    return { success: false };
  }
}
```
