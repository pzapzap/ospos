import type { SQLiteDatabase } from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { MIGRATION_V1, MIGRATION_V2, MIGRATION_V3, MIGRATION_V4, DEFAULT_SETTINGS } from './schema';

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
];

const DB_NAME = 'ospos.db';

async function backupDatabase(): Promise<void> {
  try {
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
  await backupDatabase();

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
