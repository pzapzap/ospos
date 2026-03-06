// Migration v1: All CREATE TABLE statements
// Schema exactly as specified in design doc section 4.3

export const MIGRATION_V1 = `
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  category TEXT,
  image_uri TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  subtotal REAL NOT NULL,
  tax_rate REAL NOT NULL,
  tax_amount REAL NOT NULL,
  tip_amount REAL DEFAULT 0,
  total REAL NOT NULL,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'card')),
  stripe_payment_id TEXT,
  refund_status TEXT DEFAULT 'none' CHECK(refund_status IN ('none', 'partial', 'full')),
  refund_amount REAL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('completed', 'refunded')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items(id),
  item_name TEXT NOT NULL,
  item_price REAL NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete')),
  payload TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'syncing', 'synced', 'failed')),
  retries INTEGER DEFAULT 0,
  next_retry_at TEXT,
  created_at TEXT NOT NULL,
  synced_at TEXT
);

CREATE TABLE IF NOT EXISTS migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
`;

// Migration v2: Add card_last4 column to orders
export const MIGRATION_V2 = `
ALTER TABLE orders ADD COLUMN card_last4 TEXT;
`;

// Migration v3: Performance indexes
export const MIGRATION_V3 = `
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_items_deleted_sort ON items(deleted_at, sort_order);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status_retry ON sync_queue(status, next_retry_at);
`;

// Migration v4: Convert all money columns from REAL (float dollars) to INTEGER (cents)
// SQLite is dynamically typed so no ALTER TABLE needed — just convert existing data.
export const MIGRATION_V4 = `
UPDATE items SET price = CAST(ROUND(price * 100) AS INTEGER)
  WHERE typeof(price) = 'real' OR (price < 100000 AND price != CAST(price AS INTEGER));
UPDATE orders SET
  subtotal = CAST(ROUND(subtotal * 100) AS INTEGER),
  tax_amount = CAST(ROUND(tax_amount * 100) AS INTEGER),
  tip_amount = CAST(ROUND(tip_amount * 100) AS INTEGER),
  total = CAST(ROUND(total * 100) AS INTEGER),
  refund_amount = CAST(ROUND(refund_amount * 100) AS INTEGER)
  WHERE typeof(subtotal) = 'real' OR (subtotal < 100000 AND subtotal != CAST(subtotal AS INTEGER));
UPDATE order_items SET item_price = CAST(ROUND(item_price * 100) AS INTEGER)
  WHERE typeof(item_price) = 'real' OR (item_price < 100000 AND item_price != CAST(item_price AS INTEGER));
`;

// Migration v5: Safety-net — ensure all money values are integer cents.
// V4 did the dollar→cents conversion. V5 catches any rows V4 missed
// (e.g. typeof was already 'integer' but value was dollars).
// For new installs this is a no-op.
export const MIGRATION_V5 = `
UPDATE items SET price = CAST(ROUND(price) AS INTEGER)
  WHERE typeof(price) != 'integer';
UPDATE orders SET
  subtotal = CAST(ROUND(subtotal) AS INTEGER),
  tax_amount = CAST(ROUND(tax_amount) AS INTEGER),
  tip_amount = CAST(ROUND(tip_amount) AS INTEGER),
  total = CAST(ROUND(total) AS INTEGER),
  refund_amount = CAST(ROUND(refund_amount) AS INTEGER)
  WHERE typeof(subtotal) != 'integer';
UPDATE order_items SET item_price = CAST(ROUND(item_price) AS INTEGER)
  WHERE typeof(item_price) != 'integer';
`;

// Default settings inserted on first launch
export const DEFAULT_SETTINGS = [
  { key: 'tax_rate', value: '0' },
  { key: 'currency', value: 'USD' },
  { key: 'business_name', value: '' },
  { key: 'auto_backup', value: 'on' },
];
