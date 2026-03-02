import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { runMigrations } from './migrations';

const DB_NAME = 'ospos.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export type DatabaseStatus = 'ok' | 'corrupted' | 'recovered' | 'unrecoverable';

export interface InitResult {
  status: DatabaseStatus;
  error?: string;
}

async function attemptRestoreFromBackup(): Promise<boolean> {
  try {
    const backupDir = `${FileSystem.documentDirectory}backups/`;
    const dirInfo = await FileSystem.getInfoAsync(backupDir);
    if (!dirInfo.exists) return false;

    const files = await FileSystem.readDirectoryAsync(backupDir);
    const backups = files
      .filter((f) => f.startsWith(DB_NAME))
      .sort()
      .reverse();

    if (backups.length === 0) return false;

    const dbPath = `${FileSystem.documentDirectory}SQLite/${DB_NAME}`;
    const latestBackup = `${backupDir}${backups[0]}`;
    await FileSystem.copyAsync({ from: latestBackup, to: dbPath });
    return true;
  } catch {
    return false;
  }
}

export async function initDatabase(): Promise<InitResult> {
  try {
    const db = await SQLite.openDatabaseAsync(DB_NAME);

    // Enable WAL mode
    await db.execAsync('PRAGMA journal_mode = WAL');

    // Enable foreign keys
    await db.execAsync('PRAGMA foreign_keys = ON');

    // Integrity check
    const integrityResult = await db.getFirstAsync<{ integrity_check: string }>(
      'PRAGMA integrity_check'
    );

    if (integrityResult?.integrity_check !== 'ok') {
      // Attempt restore from backup
      await db.closeAsync();
      const restored = await attemptRestoreFromBackup();

      if (restored) {
        const restoredDb = await SQLite.openDatabaseAsync(DB_NAME);
        await restoredDb.execAsync('PRAGMA journal_mode = WAL');
        await restoredDb.execAsync('PRAGMA foreign_keys = ON');
        await runMigrations(restoredDb);
        dbInstance = restoredDb;
        return { status: 'recovered' };
      }

      return {
        status: 'unrecoverable',
        error: 'Database corrupted and no backup available.',
      };
    }

    // Run migrations
    await runMigrations(db);
    dbInstance = db;
    return { status: 'ok' };
  } catch (error) {
    return {
      status: 'unrecoverable',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return dbInstance;
}
