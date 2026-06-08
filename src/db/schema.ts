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

// Migration v6: Add card_brand column to orders
export const MIGRATION_V6 = `
ALTER TABLE orders ADD COLUMN card_brand TEXT;
`;

// Migration v7: Add sticker_id column to items for the three-layer visual system
// (photo → sticker → glyph). Existing items resolve to glyph (Bitter italic
// letterform of name[0]) when sticker_id is null.
export const MIGRATION_V7 = `
ALTER TABLE items ADD COLUMN sticker_id TEXT;
`;

// Migration v8: Add modifiers table for item customization (v1.1 — QSR unlock).
// Each modifier attaches to one item, has a name + optional price delta in cents
// (positive=extra, 0=free swap, negative=discount), an optional group name for
// "Extras"/"Swaps"/"Size" labeling, and a sticker for the photo grid UI.
// Soft-deleted via deleted_at so old order_items can still resolve names.
export const MIGRATION_V8 = `
CREATE TABLE IF NOT EXISTS modifiers (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  group_name TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  sticker_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_modifiers_item ON modifiers(item_id, deleted_at, sort_order);
`;

// Migration v9: Add modifiers_json to order_items for denormalized snapshot
// of selected modifiers at sale time. JSON shape:
//   [{"name":"Avocado","price_cents":200},{"name":"No Onions","price_cents":0}]
// Null/empty when no modifiers selected (the common case for non-customized items).
export const MIGRATION_V9 = `
ALTER TABLE order_items ADD COLUMN modifiers_json TEXT;
`;

// Migration v10: Promote modifier groups from free-text label to a real table
// with selection rules. Unlocks coffee-shop / QSR customize flows where a
// merchant needs "Size — required, pick 1" or "Extras — optional, pick up to 3".
//
// Schema:
//   modifier_groups: select_type ('single'|'multi'), is_required, max_select
//   modifiers gains: group_id (FK), is_default (boolean; auto-selects in
//     customize sheet)
//
// Backfill (runs in afterUp) converts every distinct (item_id, group_name) into
// a multi-select non-required group, attaches existing modifiers to it, and
// buckets null-group modifiers into an auto-created "Options" group per item.
// modifiers.group_name stays as a one-release safety net; remove in v11.
// Migration v11: Per-item is_taxable flag. Merchants selling both prepared
// goods (taxable) and packaged retail (often non-taxable in their jurisdiction)
// need to mark individual items. Default 1 (taxable) preserves prior behavior
// — every existing item was taxed under the global tax rate. The order_items
// table isn't touched: tax_amount is already snapshotted on the order row, so
// historical receipts stay correct even if the merchant later toggles a flag.
export const MIGRATION_V11 = `
ALTER TABLE items ADD COLUMN is_taxable INTEGER NOT NULL DEFAULT 1;
`;

// Migration v12: Per-item is_available flag (a.k.a. "86'd" in restaurant
// vernacular). Lets the merchant hide an item from the order grid mid-shift
// without deleting it. Default 1 (available); flip to 0 = sold out today.
// Item stays in the editor so toggling back is one tap. Doesn't affect any
// existing orders — pure runtime filter.
export const MIGRATION_V12 = `
ALTER TABLE items ADD COLUMN is_available INTEGER NOT NULL DEFAULT 1;
`;

// Migration v13: Order-level discount snapshot. Stored on the orders row so
// historical receipts always show what was actually applied at sale time.
//   discount_type    'percent' | 'amount' | null
//   discount_value   raw input (10 for 10%; 150 for $1.50). null when no discount.
//   discount_amount  computed cents the customer was actually discounted
//   discount_reason  optional free text (e.g. "happy hour", "manager comp")
// All nullable / default 0 so historical orders are untouched.
export const MIGRATION_V13 = `
ALTER TABLE orders ADD COLUMN discount_type TEXT;
ALTER TABLE orders ADD COLUMN discount_value INTEGER;
ALTER TABLE orders ADD COLUMN discount_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN discount_reason TEXT;
`;

// Migration v14: Per-modifier is_available flag (the "86'd" toggle at the
// modifier level — parallel to items.is_available from v12). Lets merchants
// mark a specific modifier sold-out ("we're out of oat milk") without
// deleting the modifier or hiding the whole item. Default 1 (available);
// flip to 0 = sold out today. Filtered only in the customer-facing
// CustomizeItemModal; the editor always shows all modifiers so the toggle
// is reachable.
export const MIGRATION_V14 = `
ALTER TABLE modifiers ADD COLUMN is_available INTEGER NOT NULL DEFAULT 1;
`;

export const MIGRATION_V10_SCHEMA = `
CREATE TABLE IF NOT EXISTS modifier_groups (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  select_type TEXT NOT NULL DEFAULT 'multi' CHECK(select_type IN ('single', 'multi')),
  is_required INTEGER NOT NULL DEFAULT 0,
  max_select INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_modifier_groups_item ON modifier_groups(item_id, deleted_at, sort_order);

ALTER TABLE modifiers ADD COLUMN group_id TEXT REFERENCES modifier_groups(id) ON DELETE CASCADE;
ALTER TABLE modifiers ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;
`;

// Default settings inserted on first launch
export const DEFAULT_SETTINGS = [
  { key: 'tax_rate', value: '0' },
  { key: 'currency', value: 'USD' },
  { key: 'business_name', value: '' },
  { key: 'auto_backup', value: 'on' },
];
