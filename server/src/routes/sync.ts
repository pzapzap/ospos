import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  upsertSyncedOrder,
  upsertSyncedOrderItem,
  getOrdersSince,
  getOrderItems,
  SyncOwnershipError,
} from '../db/queries/orders';

const router = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYMENT_METHODS = new Set(['cash', 'card']);
const REFUND_STATUSES = new Set(['none', 'partial', 'full']);
const ORDER_STATUSES = new Set(['completed', 'refunded']);

// Money fields are integer cents. Cap at $999,999.99 to keep one merchant
// from inserting absurd values that overflow downstream calculations.
const MAX_MONEY_CENTS = 99_999_999;

function isIntegerCents(v: unknown, allowZero = true): v is number {
  if (typeof v !== 'number' || !Number.isInteger(v)) return false;
  if (v < 0 || v > MAX_MONEY_CENTS) return false;
  if (!allowZero && v === 0) return false;
  return true;
}

interface SyncedOrderInput {
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

interface SyncedOrderItemInput {
  id: string;
  order_id: string;
  item_id: string;
  item_name: string;
  item_price: number;
  quantity: number;
}

// Runtime-validate every monetary and enum field. Without this the route
// trusts the client to send well-formed payloads — bad bet for a sync
// endpoint that any authenticated client can call.
function validateOrderPayload(p: Record<string, unknown>): SyncedOrderInput | null {
  if (typeof p.id !== 'string' || !UUID_REGEX.test(p.id)) return null;
  if (!isIntegerCents(p.subtotal)) return null;
  if (!isIntegerCents(p.tax_amount)) return null;
  if (!isIntegerCents(p.tip_amount)) return null;
  if (!isIntegerCents(p.total)) return null;
  if (!isIntegerCents(p.refund_amount)) return null;
  if (typeof p.tax_rate !== 'number' || p.tax_rate < 0 || p.tax_rate > 100) return null;
  if (typeof p.payment_method !== 'string' || !PAYMENT_METHODS.has(p.payment_method)) return null;
  if (typeof p.refund_status !== 'string' || !REFUND_STATUSES.has(p.refund_status)) return null;
  if (typeof p.status !== 'string' || !ORDER_STATUSES.has(p.status)) return null;
  if (typeof p.created_at !== 'string' || isNaN(Date.parse(p.created_at))) return null;
  if (p.stripe_payment_id !== undefined && p.stripe_payment_id !== null
      && (typeof p.stripe_payment_id !== 'string' || !/^pi_[a-zA-Z0-9_]+$/.test(p.stripe_payment_id))) {
    return null;
  }
  // Refund cannot exceed total
  if ((p.refund_amount as number) > (p.total as number)) return null;
  return p as unknown as SyncedOrderInput;
}

function validateOrderItemPayload(p: Record<string, unknown>): SyncedOrderItemInput | null {
  if (typeof p.id !== 'string' || !UUID_REGEX.test(p.id)) return null;
  if (typeof p.order_id !== 'string' || !UUID_REGEX.test(p.order_id)) return null;
  if (typeof p.item_id !== 'string') return null;
  if (typeof p.item_name !== 'string' || p.item_name.length === 0 || p.item_name.length > 200) return null;
  if (!isIntegerCents(p.item_price)) return null;
  if (typeof p.quantity !== 'number' || !Number.isInteger(p.quantity) || p.quantity < 1 || p.quantity > 1000) return null;
  return p as unknown as SyncedOrderItemInput;
}

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
          const valid = validateOrderPayload(payload);
          if (!valid) {
            console.warn(`[SYNC] Rejected invalid order payload for record ${record.id}`);
            continue;
          }
          await upsertSyncedOrder(req.user.userId, valid);
          synced.push(record.id);
        } else if (record.table_name === 'order_items') {
          const valid = validateOrderItemPayload(payload);
          if (!valid) {
            console.warn(`[SYNC] Rejected invalid order_item payload for record ${record.id}`);
            continue;
          }
          await upsertSyncedOrderItem(req.user.userId, valid);
          synced.push(record.id);
        }
      } catch (error) {
        if (error instanceof SyncOwnershipError) {
          // Cross-tenant attempt — log and skip without leaking that the
          // target id exists under another user.
          console.warn(`[SYNC] Ownership violation for record ${record.id}: ${error.message}`);
        } else {
          console.error(`[SYNC] Failed to sync record ${record.id}:`, error);
        }
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
