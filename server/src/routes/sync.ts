import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  upsertSyncedOrder,
  upsertSyncedOrderItem,
  getOrdersSince,
  getOrderItems,
} from '../db/queries/orders';

const router = Router();

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
          await upsertSyncedOrder(req.user.userId, payload as Parameters<typeof upsertSyncedOrder>[1]);
          synced.push(record.id);
        } else if (record.table_name === 'order_items') {
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
