import { getDatabase } from './database';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Item {
  id: string;
  name: string;
  price: number;
  category: string | null;
  image_uri: string | null;
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
  card_last4: string | null;
  refund_status: 'none' | 'partial' | 'full';
  refund_amount: number;
  status: 'completed' | 'refunded';
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  item_id: string;
  item_name: string;
  item_price: number;
  quantity: number;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
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

export async function getActiveItems(): Promise<Item[]> {
  const db = getDatabase();
  return db.getAllAsync<Item>(
    'SELECT * FROM items WHERE deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC'
  );
}

export async function createItem(
  name: string,
  price: number,
  category?: string,
  imageUri?: string
): Promise<Item> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const id = generateUUID();

  const maxSort = await db.getFirstAsync<{ max_sort: number | null }>(
    'SELECT MAX(sort_order) as max_sort FROM items WHERE deleted_at IS NULL'
  );
  const sortOrder = (maxSort?.max_sort ?? -1) + 1;

  await db.runAsync(
    'INSERT INTO items (id, name, price, category, image_uri, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, name, price, category ?? null, imageUri ?? null, sortOrder, now, now]
  );

  const item = await db.getFirstAsync<Item>(
    'SELECT * FROM items WHERE id = ?',
    [id]
  );
  return item!;
}

export async function updateItem(
  id: string,
  updates: { name?: string; price?: number; category?: string | null; image_uri?: string | null }
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
    values.push(updates.price);
  }
  if (updates.category !== undefined) {
    sets.push('category = ?');
    values.push(updates.category);
  }
  if (updates.image_uri !== undefined) {
    sets.push('image_uri = ?');
    values.push(updates.image_uri);
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
  items: Array<{
    itemId: string;
    itemName: string;
    itemPrice: number;
    quantity: number;
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
      `INSERT INTO orders (id, subtotal, tax_rate, tax_amount, tip_amount, total, payment_method, stripe_payment_id, card_last4, refund_status, refund_amount, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'none', 0, 'completed', ?)`,
      [
        orderId,
        input.subtotal,
        input.taxRate,
        input.taxAmount,
        input.tipAmount,
        input.total,
        input.paymentMethod,
        input.stripePaymentId ?? null,
        input.cardLast4 ?? null,
        now,
      ]
    );

    for (const item of input.items) {
      const orderItemId = generateUUID();
      await db.runAsync(
        'INSERT INTO order_items (id, order_id, item_id, item_name, item_price, quantity) VALUES (?, ?, ?, ?, ?, ?)',
        [orderItemId, orderId, item.itemId, item.itemName, item.itemPrice, item.quantity]
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
  const rows = await db.getAllAsync<Order & { oi_id: string | null; oi_order_id: string | null; oi_item_id: string | null; oi_item_name: string | null; oi_item_price: number | null; oi_quantity: number | null }>(
    `SELECT o.*, oi.id as oi_id, oi.order_id as oi_order_id, oi.item_id as oi_item_id, oi.item_name as oi_item_name, oi.item_price as oi_item_price, oi.quantity as oi_quantity
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

  const rows = await db.getAllAsync<Order & { oi_id: string | null; oi_order_id: string | null; oi_item_id: string | null; oi_item_name: string | null; oi_item_price: number | null; oi_quantity: number | null }>(
    `SELECT o.*, oi.id as oi_id, oi.order_id as oi_order_id, oi.item_id as oi_item_id, oi.item_name as oi_item_name, oi.item_price as oi_item_price, oi.quantity as oi_quantity
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

// ─── Export ──────────────────────────────────────────────────────────────────

export async function getAllOrdersForExport(dateStr: string): Promise<OrderWithItems[]> {
  const db = getDatabase();

  const rows = await db.getAllAsync<Order & { oi_id: string | null; oi_order_id: string | null; oi_item_id: string | null; oi_item_name: string | null; oi_item_price: number | null; oi_quantity: number | null }>(
    `SELECT o.*, oi.id as oi_id, oi.order_id as oi_order_id, oi.item_id as oi_item_id, oi.item_name as oi_item_name, oi.item_price as oi_item_price, oi.quantity as oi_quantity
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE date(o.created_at) = date(?)
     ORDER BY o.created_at ASC`,
    [dateStr]
  );

  return groupOrderRows(rows);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

type JoinedOrderRow = Order & { oi_id: string | null; oi_order_id: string | null; oi_item_id: string | null; oi_item_name: string | null; oi_item_price: number | null; oi_quantity: number | null };

function groupOrderRows(rows: JoinedOrderRow[]): OrderWithItems[] {
  const orderMap = new Map<string, OrderWithItems>();

  for (const row of rows) {
    if (!orderMap.has(row.id)) {
      const { oi_id: _1, oi_order_id: _2, oi_item_id: _3, oi_item_name: _4, oi_item_price: _5, oi_quantity: _6, ...orderFields } = row;
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
      });
    }
  }

  return Array.from(orderMap.values());
}
