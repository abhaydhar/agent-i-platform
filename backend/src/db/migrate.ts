import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { db } from './connection';
import { env } from '../config/env';
import { createLogger } from '../utils/logger';

const log = createLogger('migrate');

const __dirname = dirname(fileURLToPath(import.meta.url));

async function ensureMigrationsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function appliedMigrations(): Promise<Set<string>> {
  const res = await db.query<{ name: string }>(
    'SELECT name FROM schema_migrations'
  );
  return new Set(res.rows.map((r) => r.name));
}

async function applyMigration(name: string, sql: string) {
  log.info(`applying ${name}`);
  await db.query('BEGIN');
  try {
    await db.query(sql);
    await db.query(
      'INSERT INTO schema_migrations(name) VALUES ($1)',
      [name]
    );
    await db.query('COMMIT');
    log.info(`applied  ${name}`);
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

async function main() {
  if (!env.databaseUrl) {
    log.error(
      'DATABASE_URL not set. Configure backend/.env before running migrations.'
    );
    process.exit(1);
  }
  const ok = await db.isAvailable();
  if (!ok) {
    log.error('database not reachable');
    process.exit(1);
  }

  await ensureMigrationsTable();
  const done = await appliedMigrations();

  const dir = join(__dirname, 'migrations');
  const files = (await readdir(dir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (done.has(file)) {
      log.info(`skip     ${file}`);
      continue;
    }
    const sql = await readFile(join(dir, file), 'utf8');
    await applyMigration(file, sql);
  }

  log.info('migrations complete');
  await db.close();
}

main().catch((err) => {
  log.error('migration failed', err);
  process.exit(1);
});
