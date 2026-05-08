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

// Thrown when a sync upsert would cross a tenant boundary (e.g. User A
// trying to upsert an order whose id already exists under User B). The
// route handler catches this and skips the record.
export class SyncOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncOwnershipError';
  }
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
  // Tenant isolation: if a row with this id already exists under a
  // different user, refuse the upsert. Without this check, a client that
  // exfiltrates another tenant's order UUID could overwrite their record.
  const existing = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM synced_orders WHERE id = $1',
    [order.id]
  );
  if (existing && existing.user_id !== userId) {
    throw new SyncOwnershipError(`Order ${order.id} belongs to another user`);
  }

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
  userId: string,
  item: {
    id: string;
    order_id: string;
    item_id: string;
    item_name: string;
    item_price: number;
    quantity: number;
  }
): Promise<void> {
  // Tenant isolation: the parent order MUST belong to this user. If the
  // order doesn't exist yet (race with the order's own sync record) or
  // belongs to someone else, refuse the line item.
  const parent = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM synced_orders WHERE id = $1',
    [item.order_id]
  );
  if (!parent) {
    throw new SyncOwnershipError(`Parent order ${item.order_id} not found`);
  }
  if (parent.user_id !== userId) {
    throw new SyncOwnershipError(`Parent order ${item.order_id} belongs to another user`);
  }

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
