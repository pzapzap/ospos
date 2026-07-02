import type { SQLiteDatabase } from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { MIGRATION_V1, MIGRATION_V2, MIGRATION_V3, MIGRATION_V4, MIGRATION_V5, MIGRATION_V6, MIGRATION_V7, MIGRATION_V8, MIGRATION_V9, MIGRATION_V10_SCHEMA, MIGRATION_V11, MIGRATION_V12, MIGRATION_V13, MIGRATION_V14, DEFAULT_SETTINGS } from './schema';

// Local UUID generator — same algorithm as queries.ts. Inlined here to avoid
// a migration→queries import cycle.
function migUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = (Math.random() * 256) | 0;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface Migration {
  version: number;
  up: string;
  afterUp?: (db: SQLiteDatabase) => Promise<void>;
}

const migrations: Migration[] = [
  {
    version: 1,
    up: MIGRATION_V1,
    afterUp: async (db: SQLiteDatabase) => {
      for (const setting of DEFAULT_SETTINGS) {
        await db.runAsync(
          'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
          [setting.key, setting.value]
        );
      }
    },
  },
  {
    version: 2,
    up: MIGRATION_V2,
  },
  {
    version: 3,
    up: MIGRATION_V3,
  },
  {
    version: 4,
    up: MIGRATION_V4,
  },
  {
    version: 5,
    up: MIGRATION_V5,
  },
  {
    version: 6,
    up: MIGRATION_V6,
  },
  {
    version: 7,
    up: MIGRATION_V7,
  },
  {
    version: 8,
    up: MIGRATION_V8,
  },
  {
    version: 9,
    up: MIGRATION_V9,
  },
  {
    version: 10,
    up: MIGRATION_V10_SCHEMA,
    afterUp: backfillModifierGroups,
  },
  {
    version: 11,
    up: MIGRATION_V11,
  },
  {
    version: 12,
    up: MIGRATION_V12,
  },
  {
    version: 13,
    up: MIGRATION_V13,
  },
  {
    version: 14,
    up: MIGRATION_V14,
  },
];

// v10 backfill: turn every distinct (item_id, group_name) pair on existing
// modifiers into a real modifier_groups row, then attach the modifiers.
// Null group_names get bucketed into a single "Options" group per item.
// Resulting groups default to multi-select / not required — merchant can
// promote them to required/single in the editor.
async function backfillModifierGroups(db: SQLiteDatabase): Promise<void> {
  const rows = await db.getAllAsync<{ item_id: string; group_name: string | null }>(
    `SELECT DISTINCT item_id, group_name
     FROM modifiers
     WHERE deleted_at IS NULL AND group_id IS NULL`
  );
  if (rows.length === 0) return;

  const now = new Date().toISOString();
  for (const { item_id, group_name } of rows) {
    const groupId = migUUID();
    const displayName = group_name && group_name.trim() ? group_name.trim() : 'Options';
    await db.runAsync(
      `INSERT INTO modifier_groups (id, item_id, name, select_type, is_required, max_select, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, 'multi', 0, NULL, 0, ?, ?)`,
      [groupId, item_id, displayName, now, now]
    );
    if (group_name === null) {
      await db.runAsync(
        `UPDATE modifiers SET group_id = ? WHERE item_id = ? AND group_name IS NULL AND group_id IS NULL`,
        [groupId, item_id]
      );
    } else {
      await db.runAsync(
        `UPDATE modifiers SET group_id = ? WHERE item_id = ? AND group_name = ? AND group_id IS NULL`,
        [groupId, item_id, group_name]
      );
    }
  }
}

const DB_NAME = 'ospos.db';

async function backupDatabase(db: SQLiteDatabase): Promise<void> {
  try {
    // WAL journaling means recently committed transactions live in
    // ospos.db-wal until the next checkpoint. A raw file copy of ospos.db
    // alone would silently drop those most-recent orders. Force a
    // TRUNCATE checkpoint first so the WAL is drained into the main file,
    // then copy the whole set (main + wal + shm) so the backup is an
    // atomic snapshot on restore.
    try {
      await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch {
      // If the checkpoint fails (e.g. read-only reader still open), fall
      // back to copying the sidecars so a restore can replay them.
    }

    const dbPath = `${FileSystem.documentDirectory}SQLite/${DB_NAME}`;
    const backupDir = `${FileSystem.documentDirectory}backups/`;
    const dirInfo = await FileSystem.getInfoAsync(backupDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(backupDir, { intermediates: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${backupDir}${DB_NAME}.${timestamp}.bak`;
    const dbInfo = await FileSystem.getInfoAsync(dbPath);
    if (dbInfo.exists) {
      await FileSystem.copyAsync({ from: dbPath, to: backupPath });
      // Also copy the WAL sidecars if they exist post-checkpoint. The
      // TRUNCATE mode usually leaves them empty (or zero-length) but
      // copying them keeps the backup byte-consistent with the main file
      // it was captured against.
      const walPath = `${dbPath}-wal`;
      const shmPath = `${dbPath}-shm`;
      const walInfo = await FileSystem.getInfoAsync(walPath);
      if (walInfo.exists) {
        await FileSystem.copyAsync({ from: walPath, to: `${backupPath}-wal` });
      }
      const shmInfo = await FileSystem.getInfoAsync(shmPath);
      if (shmInfo.exists) {
        await FileSystem.copyAsync({ from: shmPath, to: `${backupPath}-shm` });
      }
    }
  } catch {
    // Backup failure is non-fatal for migrations
  }
}

export async function getCurrentVersion(db: SQLiteDatabase): Promise<number> {
  try {
    const result = await db.getFirstAsync<{ version: number }>(
      'SELECT MAX(version) as version FROM migrations'
    );
    return result?.version ?? 0;
  } catch {
    return 0;
  }
}

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const currentVersion = await getCurrentVersion(db);
  const pendingMigrations = migrations.filter((m) => m.version > currentVersion);

  if (pendingMigrations.length === 0) {
    return;
  }

  // Backup before any migration
  await backupDatabase(db);

  for (const migration of pendingMigrations) {
    await db.execAsync('BEGIN TRANSACTION');
    try {
      await db.execAsync(migration.up);
      await db.runAsync(
        'INSERT INTO migrations (version, applied_at) VALUES (?, ?)',
        [migration.version, new Date().toISOString()]
      );
      if (migration.afterUp) {
        await migration.afterUp(db);
      }
      await db.execAsync('COMMIT');
    } catch (error) {
      await db.execAsync('ROLLBACK');
      throw new Error(
        `Migration v${migration.version} failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
