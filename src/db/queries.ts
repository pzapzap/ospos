import { getDatabase } from './database';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Item {
  id: string;
  name: string;
  price: number;
  category: string | null;
  image_uri: string | null;
  sticker_id: string | null;
  is_taxable: number;          // 0 | 1 — SQLite has no boolean. 1 = subject to tax
  is_available: number;        // 0 | 1 — 0 = 86'd / sold out today, hidden from order grid
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Order {
  id: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  tip_amount: number;
  total: number;
  payment_method: 'cash' | 'card';
  stripe_payment_id: string | null;
  refund_status: 'none' | 'partial' | 'full';
  refund_amount: number;
  status: 'completed' | 'refunded';
  created_at: string;
  card_last4: string | null;
  card_brand: string | null;
  discount_type: 'percent' | 'amount' | null;
  discount_value: number | null;   // raw input — 10 for 10%, 150 for $1.50
  discount_amount: number;          // computed cents discounted from subtotal
  discount_reason: string | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  item_id: string;
  item_name: string;
  item_price: number;
  quantity: number;
  modifiers: ModifierSnapshot[];  // denormalized from modifiers_json
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
}

// Modifier group — buckets modifiers under a labeled section with selection
// rules (required, single/multi-select, max selections). One group per
// (item, section) — e.g. a Latte has groups "Size", "Milk", "Extras".
export interface ModifierGroup {
  id: string;
  item_id: string;
  name: string;
  select_type: 'single' | 'multi';
  is_required: number;       // 0 | 1 — SQLite has no boolean
  max_select: number | null; // multi only; null = no limit
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Modifier — attaches to one group on one item, optional price delta in cents.
// Positive = extra ("+Avocado +$2"), 0 = free swap ("Lettuce wrap"),
// negative = discount ("No bacon -$1").
// group_name kept for one release as backfill safety net; group_id is the
// real linkage post-v10.
export interface Modifier {
  id: string;
  item_id: string;
  group_id: string | null;
  name: string;
  price_cents: number;
  group_name: string | null;
  is_default: number;        // 0 | 1
  is_available: number;      // 0 | 1 — added v14; 0 = sold out today
  sort_order: number;
  sticker_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Snapshot of a selected modifier saved on an order_item at sale time.
// Name + price are denormalized so renaming/deleting a modifier later doesn't
// retroactively change historical orders. group_name kept for receipt grouping.
export interface ModifierSnapshot {
  name: string;
  price_cents: number;
  group_name?: string | null;
}

// ─── UUID Generation ─────────────────────────────────────────────────────────

function generateUUID(): string {
  // Use crypto.randomUUID if available, fallback to crypto.getRandomValues
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback using getRandomValues for better randomness than Math.random
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = (Math.random() * 256) | 0;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ─── Items ───────────────────────────────────────────────────────────────────

// Returns every non-deleted item — used by the menu editor where 86'd items
// must still appear (with a Sold Out badge) so the merchant can toggle back.
export async function getActiveItems(): Promise<Item[]> {
  const db = getDatabase();
  return db.getAllAsync<Item>(
    'SELECT * FROM items WHERE deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC'
  );
}

// Returns items the cashier should see in the order grid — non-deleted AND
// not 86'd. Used by OrderScreen only.
export async function getOrderableItems(): Promise<Item[]> {
  const db = getDatabase();
  return db.getAllAsync<Item>(
    'SELECT * FROM items WHERE deleted_at IS NULL AND is_available = 1 ORDER BY sort_order ASC, created_at ASC'
  );
}

// Distinct non-empty categories currently in use, alphabetical. Powers the
// category autocomplete in AddItemModal so merchants don't end up with
// "Drinks"/"drinks"/"DRINKS" as three separate categories.
export async function getDistinctCategories(): Promise<string[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{ category: string }>(
    `SELECT DISTINCT category FROM items
     WHERE deleted_at IS NULL AND category IS NOT NULL AND category != ''
     ORDER BY category COLLATE NOCASE ASC`
  );
  return rows.map((r) => r.category);
}

export async function createItem(
  name: string,
  price: number,
  category?: string,
  imageUri?: string,
  stickerId?: string,
  isTaxable: boolean = true,    // default taxable — matches pre-v11 behavior
  isAvailable: boolean = true,  // default available — new items are orderable
): Promise<Item> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const id = generateUUID();

  const maxSort = await db.getFirstAsync<{ max_sort: number | null }>(
    'SELECT MAX(sort_order) as max_sort FROM items WHERE deleted_at IS NULL'
  );
  const sortOrder = (maxSort?.max_sort ?? -1) + 1;

  await db.runAsync(
    'INSERT INTO items (id, name, price, category, image_uri, sticker_id, is_taxable, is_available, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, name, Math.round(price), category ?? null, imageUri ?? null, stickerId ?? null, isTaxable ? 1 : 0, isAvailable ? 1 : 0, sortOrder, now, now]
  );

  const item = await db.getFirstAsync<Item>(
    'SELECT * FROM items WHERE id = ?',
    [id]
  );
  return item!;
}

export async function updateItem(
  id: string,
  updates: { name?: string; price?: number; category?: string | null; image_uri?: string | null; sticker_id?: string | null; is_taxable?: boolean; is_available?: boolean }
): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const sets: string[] = ['updated_at = ?'];
  const values: (string | number | null)[] = [now];

  if (updates.name !== undefined) {
    sets.push('name = ?');
    values.push(updates.name);
  }
  if (updates.price !== undefined) {
    sets.push('price = ?');
    values.push(Math.round(updates.price));
  }
  if (updates.category !== undefined) {
    sets.push('category = ?');
    values.push(updates.category);
  }
  if (updates.image_uri !== undefined) {
    sets.push('image_uri = ?');
    values.push(updates.image_uri);
  }
  if (updates.sticker_id !== undefined) {
    sets.push('sticker_id = ?');
    values.push(updates.sticker_id);
  }
  if (updates.is_taxable !== undefined) {
    sets.push('is_taxable = ?');
    values.push(updates.is_taxable ? 1 : 0);
  }
  if (updates.is_available !== undefined) {
    sets.push('is_available = ?');
    values.push(updates.is_available ? 1 : 0);
  }

  values.push(id);
  await db.runAsync(
    `UPDATE items SET ${sets.join(', ')} WHERE id = ?`,
    values
  );
}

export async function softDeleteItem(id: string): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?',
    [now, now, id]
  );
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export interface CreateOrderInput {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  tipAmount: number;
  total: number;
  paymentMethod: 'cash' | 'card';
  stripePaymentId?: string;
  cardLast4?: string;
  cardBrand?: string;
  discount?: {
    type: 'percent' | 'amount';
    value: number;            // raw input
    amountCents: number;      // computed cents
    reason?: string;
  };
  items: Array<{
    itemId: string;
    itemName: string;
    itemPrice: number;        // base price BEFORE modifiers
    quantity: number;
    modifiers?: ModifierSnapshot[];  // empty / undefined for un-customized items
  }>;
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const db = getDatabase();
  const orderId = generateUUID();
  const now = new Date().toISOString();

  // Single transaction — order + all order_items
  await db.execAsync('BEGIN TRANSACTION');
  try {
    await db.runAsync(
      `INSERT INTO orders (id, subtotal, tax_rate, tax_amount, tip_amount, total, payment_method, stripe_payment_id, refund_status, refund_amount, status, created_at, card_last4, card_brand, discount_type, discount_value, discount_amount, discount_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'none', 0, 'completed', ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        Math.round(input.subtotal),
        input.taxRate,
        Math.round(input.taxAmount),
        Math.round(input.tipAmount),
        Math.round(input.total),
        input.paymentMethod,
        input.stripePaymentId ?? null,
        now,
        input.cardLast4 ?? null,
        input.cardBrand ?? null,
        input.discount?.type ?? null,
        input.discount?.value ?? null,
        input.discount ? Math.round(input.discount.amountCents) : 0,
        input.discount?.reason ?? null,
      ]
    );

    for (const item of input.items) {
      const orderItemId = generateUUID();
      // modifiers_json stays null when no modifiers — keeps storage minimal
      // for the common (un-customized) case.
      const modifiersJson = item.modifiers && item.modifiers.length > 0
        ? JSON.stringify(item.modifiers.map((m) => ({
            name: m.name,
            price_cents: Math.round(m.price_cents),
            ...(m.group_name ? { group_name: m.group_name } : {}),
          })))
        : null;
      await db.runAsync(
        'INSERT INTO order_items (id, order_id, item_id, item_name, item_price, quantity, modifiers_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [orderItemId, orderId, item.itemId, item.itemName, Math.round(item.itemPrice), item.quantity, modifiersJson]
      );
    }

    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }

  const order = await db.getFirstAsync<Order>(
    'SELECT * FROM orders WHERE id = ?',
    [orderId]
  );
  return order!;
}

export async function getOrdersForDate(dateStr: string): Promise<Order[]> {
  const db = getDatabase();
  return db.getAllAsync<Order>(
    `SELECT * FROM orders WHERE date(created_at) = date(?) ORDER BY created_at DESC`,
    [dateStr]
  );
}

export async function getOrdersForDateRange(startDate: string, endDate: string): Promise<Order[]> {
  const db = getDatabase();
  return db.getAllAsync<Order>(
    `SELECT * FROM orders WHERE date(created_at) >= date(?) AND date(created_at) <= date(?) ORDER BY created_at DESC`,
    [startDate, endDate]
  );
}

export async function getStatsForDateRange(
  startDate: string,
  endDate: string
): Promise<{
  totalSales: number;
  transactionCount: number;
  cashTotal: number;
  cardTotal: number;
  averageValue: number;
}> {
  const db = getDatabase();

  const stats = await db.getFirstAsync<{
    total_sales: number | null;
    tx_count: number;
    cash_total: number | null;
    card_total: number | null;
  }>(
    `SELECT
       COALESCE(SUM(total), 0) as total_sales,
       COUNT(*) as tx_count,
       COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) as cash_total,
       COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END), 0) as card_total
     FROM orders
     WHERE date(created_at) >= date(?)
       AND date(created_at) <= date(?)
       AND status = 'completed'`,
    [startDate, endDate]
  );

  const totalSales = stats?.total_sales ?? 0;
  const txCount = stats?.tx_count ?? 0;

  return {
    totalSales,
    transactionCount: txCount,
    cashTotal: stats?.cash_total ?? 0,
    cardTotal: stats?.card_total ?? 0,
    averageValue: txCount > 0 ? totalSales / txCount : 0,
  };
}

export async function getAllOrdersForDateRange(
  startDate: string,
  endDate: string
): Promise<OrderWithItems[]> {
  const db = getDatabase();

  // Single JOIN query instead of N+1
  const rows = await db.getAllAsync<JoinedOrderRow>(
    `SELECT o.*, oi.id as oi_id, oi.order_id as oi_order_id, oi.item_id as oi_item_id, oi.item_name as oi_item_name, oi.item_price as oi_item_price, oi.quantity as oi_quantity, oi.modifiers_json as oi_modifiers_json
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE date(o.created_at) >= date(?) AND date(o.created_at) <= date(?)
     ORDER BY o.created_at ASC`,
    [startDate, endDate]
  );

  return groupOrderRows(rows);
}

export async function getOrderWithItems(orderId: string): Promise<OrderWithItems | null> {
  const db = getDatabase();

  const rows = await db.getAllAsync<JoinedOrderRow>(
    `SELECT o.*, oi.id as oi_id, oi.order_id as oi_order_id, oi.item_id as oi_item_id, oi.item_name as oi_item_name, oi.item_price as oi_item_price, oi.quantity as oi_quantity, oi.modifiers_json as oi_modifiers_json
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.id = ?`,
    [orderId]
  );

  if (rows.length === 0) return null;
  return groupOrderRows(rows)[0];
}

export async function getTodayStats(): Promise<{
  totalSales: number;
  transactionCount: number;
  cashTotal: number;
  cardTotal: number;
  averageValue: number;
}> {
  const db = getDatabase();
  const today = new Date().toISOString().split('T')[0];

  const stats = await db.getFirstAsync<{
    total_sales: number | null;
    tx_count: number;
    cash_total: number | null;
    card_total: number | null;
  }>(
    `SELECT
       COALESCE(SUM(total), 0) as total_sales,
       COUNT(*) as tx_count,
       COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) as cash_total,
       COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END), 0) as card_total
     FROM orders
     WHERE date(created_at) = date(?)
       AND status = 'completed'`,
    [today]
  );

  const totalSales = stats?.total_sales ?? 0;
  const txCount = stats?.tx_count ?? 0;

  return {
    totalSales,
    transactionCount: txCount,
    cashTotal: stats?.cash_total ?? 0,
    cardTotal: stats?.card_total ?? 0,
    averageValue: txCount > 0 ? totalSales / txCount : 0,
  };
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const db = getDatabase();
  const result = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM settings WHERE key = ?',
    [key]
  );
  return result?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [key, value]
  );
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{ key: string; value: string | null }>(
    'SELECT key, value FROM settings'
  );
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value ?? '';
  }
  return settings;
}

export async function batchSetSettings(settings: Record<string, string>): Promise<void> {
  const db = getDatabase();
  const entries = Object.entries(settings);
  if (entries.length === 0) return;

  await db.execAsync('BEGIN TRANSACTION');
  try {
    for (const [key, value] of entries) {
      await db.runAsync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        [key, value]
      );
    }
    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}

// ─── Export ──────────────────────────────────────────────────────────────────

export async function getAllOrdersForExport(dateStr: string): Promise<OrderWithItems[]> {
  const db = getDatabase();

  const rows = await db.getAllAsync<JoinedOrderRow>(
    `SELECT o.*, oi.id as oi_id, oi.order_id as oi_order_id, oi.item_id as oi_item_id, oi.item_name as oi_item_name, oi.item_price as oi_item_price, oi.quantity as oi_quantity, oi.modifiers_json as oi_modifiers_json
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE date(o.created_at) = date(?)
     ORDER BY o.created_at ASC`,
    [dateStr]
  );

  return groupOrderRows(rows);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

type JoinedOrderRow = Order & {
  oi_id: string | null;
  oi_order_id: string | null;
  oi_item_id: string | null;
  oi_item_name: string | null;
  oi_item_price: number | null;
  oi_quantity: number | null;
  oi_modifiers_json: string | null;
};

function parseModifiers(json: string | null): ModifierSnapshot[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m): m is ModifierSnapshot => typeof m?.name === 'string' && typeof m?.price_cents === 'number')
      .map((m) => ({
        name: m.name,
        price_cents: m.price_cents,
        ...(typeof m.group_name === 'string' ? { group_name: m.group_name } : {}),
      }));
  } catch {
    return [];
  }
}

function groupOrderRows(rows: JoinedOrderRow[]): OrderWithItems[] {
  const orderMap = new Map<string, OrderWithItems>();

  for (const row of rows) {
    if (!orderMap.has(row.id)) {
      const { oi_id: _1, oi_order_id: _2, oi_item_id: _3, oi_item_name: _4, oi_item_price: _5, oi_quantity: _6, oi_modifiers_json: _7, ...orderFields } = row;
      orderMap.set(row.id, { ...orderFields, items: [] });
    }

    if (row.oi_id) {
      orderMap.get(row.id)!.items.push({
        id: row.oi_id,
        order_id: row.oi_order_id!,
        item_id: row.oi_item_id!,
        item_name: row.oi_item_name!,
        item_price: row.oi_item_price!,
        quantity: row.oi_quantity!,
        modifiers: parseModifiers(row.oi_modifiers_json),
      });
    }
  }

  return Array.from(orderMap.values());
}

// ─── Modifier Groups CRUD ───────────────────────────────────────────────────

export async function getGroupsForItem(itemId: string): Promise<ModifierGroup[]> {
  const db = getDatabase();
  return db.getAllAsync<ModifierGroup>(
    `SELECT * FROM modifier_groups
     WHERE item_id = ? AND deleted_at IS NULL
     ORDER BY sort_order ASC, created_at ASC`,
    [itemId]
  );
}

export async function createGroup(input: {
  itemId: string;
  name: string;
  selectType?: 'single' | 'multi';
  isRequired?: boolean;
  maxSelect?: number | null;
  sortOrder?: number;
}): Promise<ModifierGroup> {
  const db = getDatabase();
  const id = generateUUID();
  const now = new Date().toISOString();
  // sortOrder defaults to last — count existing groups for this item
  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const max = await db.getFirstAsync<{ max_sort: number | null }>(
      `SELECT MAX(sort_order) as max_sort FROM modifier_groups
       WHERE item_id = ? AND deleted_at IS NULL`,
      [input.itemId]
    );
    sortOrder = (max?.max_sort ?? -1) + 1;
  }
  await db.runAsync(
    `INSERT INTO modifier_groups (id, item_id, name, select_type, is_required, max_select, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.itemId,
      input.name.trim() || 'Options',
      input.selectType ?? 'multi',
      input.isRequired ? 1 : 0,
      input.maxSelect ?? null,
      sortOrder,
      now,
      now,
    ]
  );
  const row = await db.getFirstAsync<ModifierGroup>(
    'SELECT * FROM modifier_groups WHERE id = ?',
    [id]
  );
  return row!;
}

export async function updateGroup(
  id: string,
  updates: {
    name?: string;
    selectType?: 'single' | 'multi';
    isRequired?: boolean;
    maxSelect?: number | null;
    sortOrder?: number;
  }
): Promise<void> {
  const db = getDatabase();
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (updates.name !== undefined) { sets.push('name = ?'); args.push(updates.name.trim() || 'Options'); }
  if (updates.selectType !== undefined) { sets.push('select_type = ?'); args.push(updates.selectType); }
  if (updates.isRequired !== undefined) { sets.push('is_required = ?'); args.push(updates.isRequired ? 1 : 0); }
  if (updates.maxSelect !== undefined) { sets.push('max_select = ?'); args.push(updates.maxSelect); }
  if (updates.sortOrder !== undefined) { sets.push('sort_order = ?'); args.push(updates.sortOrder); }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  args.push(new Date().toISOString());
  args.push(id);
  await db.runAsync(`UPDATE modifier_groups SET ${sets.join(', ')} WHERE id = ?`, args);
}

// Soft-deletes the group AND cascades a soft delete to its modifiers so the
// customize sheet doesn't render orphans.
export async function softDeleteGroup(id: string): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.execAsync('BEGIN TRANSACTION');
  try {
    await db.runAsync('UPDATE modifier_groups SET deleted_at = ? WHERE id = ?', [now, id]);
    await db.runAsync(
      'UPDATE modifiers SET deleted_at = ?, updated_at = ? WHERE group_id = ? AND deleted_at IS NULL',
      [now, now, id]
    );
    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}

// ─── Modifiers CRUD ─────────────────────────────────────────────────────────

export async function getModifiersForItem(itemId: string): Promise<Modifier[]> {
  const db = getDatabase();
  return db.getAllAsync<Modifier>(
    'SELECT * FROM modifiers WHERE item_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, name ASC',
    [itemId]
  );
}

export async function getModifiersForGroup(groupId: string): Promise<Modifier[]> {
  const db = getDatabase();
  return db.getAllAsync<Modifier>(
    'SELECT * FROM modifiers WHERE group_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, name ASC',
    [groupId]
  );
}

export async function createModifier(input: {
  itemId: string;
  groupId: string;            // post-v10 every modifier belongs to a group
  name: string;
  priceCents: number;
  groupName?: string | null;  // legacy safety net — mirrored from group's name
  stickerId?: string | null;
  isDefault?: boolean;
  isAvailable?: boolean;      // v14 — default true; pass false to create as sold-out
  sortOrder?: number;
}): Promise<Modifier> {
  const db = getDatabase();
  const id = generateUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO modifiers (id, item_id, group_id, name, price_cents, group_name, is_default, is_available, sort_order, sticker_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.itemId,
      input.groupId,
      input.name.trim(),
      Math.round(input.priceCents),
      input.groupName ?? null,
      input.isDefault ? 1 : 0,
      input.isAvailable === false ? 0 : 1,
      input.sortOrder ?? 0,
      input.stickerId ?? null,
      now,
      now,
    ]
  );
  const row = await db.getFirstAsync<Modifier>('SELECT * FROM modifiers WHERE id = ?', [id]);
  return row!;
}

export async function updateModifier(
  id: string,
  updates: {
    name?: string;
    priceCents?: number;
    groupId?: string;
    groupName?: string | null;
    stickerId?: string | null;
    isDefault?: boolean;
    isAvailable?: boolean;
    sortOrder?: number;
  }
): Promise<void> {
  const db = getDatabase();
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (updates.name !== undefined) { sets.push('name = ?'); args.push(updates.name.trim()); }
  if (updates.priceCents !== undefined) { sets.push('price_cents = ?'); args.push(Math.round(updates.priceCents)); }
  if (updates.groupId !== undefined) { sets.push('group_id = ?'); args.push(updates.groupId); }
  if (updates.groupName !== undefined) { sets.push('group_name = ?'); args.push(updates.groupName); }
  if (updates.stickerId !== undefined) { sets.push('sticker_id = ?'); args.push(updates.stickerId); }
  if (updates.isDefault !== undefined) { sets.push('is_default = ?'); args.push(updates.isDefault ? 1 : 0); }
  if (updates.isAvailable !== undefined) { sets.push('is_available = ?'); args.push(updates.isAvailable ? 1 : 0); }
  if (updates.sortOrder !== undefined) { sets.push('sort_order = ?'); args.push(updates.sortOrder); }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  args.push(new Date().toISOString());
  args.push(id);
  await db.runAsync(`UPDATE modifiers SET ${sets.join(', ')} WHERE id = ?`, args);
}

export async function softDeleteModifier(id: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync('UPDATE modifiers SET deleted_at = ? WHERE id = ?', [new Date().toISOString(), id]);
}
