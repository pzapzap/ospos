import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { pool, queryOne } from './connection';

async function migrate(): Promise<void> {
  // Ensure migrations tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const currentVersion = await queryOne<{ version: number }>(
    'SELECT MAX(version) as version FROM schema_migrations'
  );
  const current = currentVersion?.version ?? 0;

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const versionMatch = file.match(/^(\d+)/);
    if (!versionMatch) continue;

    const version = parseInt(versionMatch[1], 10);
    if (version <= current) continue;

    console.log(`[MIGRATE] Running migration ${file}...`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      console.log(`[MIGRATE] Migration ${file} applied successfully.`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`[MIGRATE] Migration ${file} failed:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  console.log('[MIGRATE] All migrations up to date.');
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[MIGRATE] Fatal error:', err);
    process.exit(1);
  });
