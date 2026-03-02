// Weekly auto-backup to local filesystem
import * as FileSystem from 'expo-file-system/legacy';
import { generateCSV } from './export';

const BACKUP_DIR = `${FileSystem.documentDirectory}backups/`;
const LAST_BACKUP_KEY = 'ospos_last_backup';

async function ensureBackupDir(): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(BACKUP_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(BACKUP_DIR, { intermediates: true });
  }
}

export async function performBackup(): Promise<string | null> {
  try {
    await ensureBackupDir();

    const today = new Date().toISOString().split('T')[0];
    const csv = await generateCSV(today);

    if (!csv) return null;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `ospos-backup-${timestamp}.csv`;
    const filePath = `${BACKUP_DIR}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    return filePath;
  } catch {
    return null;
  }
}

export async function shouldAutoBackup(): Promise<boolean> {
  try {
    const lastBackupFile = `${FileSystem.documentDirectory}${LAST_BACKUP_KEY}`;
    const info = await FileSystem.getInfoAsync(lastBackupFile);

    if (!info.exists) return true;

    const content = await FileSystem.readAsStringAsync(lastBackupFile);
    const lastBackup = new Date(content);
    const now = new Date();
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    return now.getTime() - lastBackup.getTime() >= weekMs;
  } catch {
    return true;
  }
}

export async function recordBackupTime(): Promise<void> {
  const lastBackupFile = `${FileSystem.documentDirectory}${LAST_BACKUP_KEY}`;
  await FileSystem.writeAsStringAsync(lastBackupFile, new Date().toISOString());
}
