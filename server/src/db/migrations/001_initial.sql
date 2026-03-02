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
