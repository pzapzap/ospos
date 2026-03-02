// Sync engine — background task every 30 seconds when online
// Reads sync_queue, posts to backend, handles retries with exponential backoff

import { getDatabase } from '../db/database';
import { syncPush } from './api';
import { hasToken } from './api';

interface SyncQueueRecord {
  id: number;
  table_name: string;
  record_id: string;
  action: string;
  payload: string;
  status: string;
  retries: number;
  next_retry_at: string | null;
  created_at: string;
}

let syncInterval: ReturnType<typeof setInterval> | null = null;

export async function processSyncQueue(): Promise<void> {
  const isLoggedIn = await hasToken();
  if (!isLoggedIn) return;

  let db;
  try {
    db = getDatabase();
  } catch {
    return; // DB not ready yet
  }

  try {
    // Read pending records ready for sync
    const now = new Date().toISOString();
    const records = await db.getAllAsync<SyncQueueRecord>(
      `SELECT * FROM sync_queue
       WHERE status = 'pending'
         AND (next_retry_at IS NULL OR next_retry_at <= ?)
       ORDER BY created_at ASC
       LIMIT 50`,
      [now]
    );

    if (records.length === 0) return;

    // Mark as syncing
    const ids = records.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    await db.runAsync(
      `UPDATE sync_queue SET status = 'syncing' WHERE id IN (${placeholders})`,
      ids
    );

    try {
      // POST to backend
      const result = await syncPush(records);
      const syncedIds = new Set(result.synced);

      // Mark synced records
      const syncedAt = new Date().toISOString();
      for (const record of records) {
        if (syncedIds.has(record.id)) {
          await db.runAsync(
            `UPDATE sync_queue SET status = 'synced', synced_at = ? WHERE id = ?`,
            [syncedAt, record.id]
          );
        } else {
          // Not synced — mark as failed with retry
          const newRetries = record.retries + 1;
          const backoffMs = Math.min(Math.pow(2, newRetries) * 1000, 30000);
          const nextRetry = new Date(Date.now() + backoffMs).toISOString();

          await db.runAsync(
            `UPDATE sync_queue SET status = 'pending', retries = ?, next_retry_at = ? WHERE id = ?`,
            [newRetries, nextRetry, record.id]
          );
        }
      }
    } catch (error) {
      if (__DEV__) console.warn('[SYNC] Network failure:', error instanceof Error ? error.message : error);
      for (const record of records) {
        const newRetries = record.retries + 1;
        const backoffMs = Math.min(Math.pow(2, newRetries) * 1000, 30000);
        const nextRetry = new Date(Date.now() + backoffMs).toISOString();

        await db.runAsync(
          `UPDATE sync_queue SET status = 'pending', retries = ?, next_retry_at = ? WHERE id = ?`,
          [newRetries, nextRetry, record.id]
        );
      }
    }
  } catch (error) {
    if (__DEV__) console.warn('[SYNC] Processing error:', error instanceof Error ? error.message : error);
  }
}

export async function startSyncEngine(): Promise<void> {
  if (syncInterval) return;

  // Recover any records stranded in 'syncing' state from a previous crash
  try {
    const db = getDatabase();
    await db.runAsync(
      `UPDATE sync_queue SET status = 'pending', next_retry_at = NULL WHERE status = 'syncing'`
    );
    // Prune old synced records (older than 30 days)
    await db.runAsync(
      `DELETE FROM sync_queue WHERE status = 'synced' AND synced_at < datetime('now', '-30 days')`
    );
  } catch {
    // Recovery is best-effort
  }

  syncInterval = setInterval(processSyncQueue, 30000);
  // Run immediately on start
  processSyncQueue();
}

export function stopSyncEngine(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

// Get sync health stats for Settings display
export async function getSyncHealth(): Promise<{
  pendingCount: number;
  failedCount: number;
  lastSyncedAt: string | null;
}> {
  const db = getDatabase();

  const pending = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM sync_queue WHERE status IN ('pending', 'syncing')`
  );

  const failed = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending' AND retries >= 10`
  );

  const lastSynced = await db.getFirstAsync<{ synced_at: string | null }>(
    `SELECT MAX(synced_at) as synced_at FROM sync_queue WHERE status = 'synced'`
  );

  return {
    pendingCount: pending?.count ?? 0,
    failedCount: failed?.count ?? 0,
    lastSyncedAt: lastSynced?.synced_at ?? null,
  };
}

// Force retry all failed records
export async function forceRetryFailed(): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `UPDATE sync_queue SET status = 'pending', retries = 0, next_retry_at = NULL
     WHERE status = 'pending' AND retries >= 10`
  );
  await processSyncQueue();
}
