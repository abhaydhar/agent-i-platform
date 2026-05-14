import pg from 'pg';
import { env } from '../config/env';
import { createLogger } from '../utils/logger';

const log = createLogger('db');

let pool: pg.Pool | null = null;
let lastProbe: { ts: number; ok: boolean } | null = null;

function getPool(): pg.Pool | null {
  if (!env.databaseUrl) return null;
  if (pool) return pool;
  pool = new pg.Pool({
    connectionString: env.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  pool.on('error', (err) => {
    log.error('pool error', err);
  });
  return pool;
}

async function isAvailable(): Promise<boolean> {
  if (lastProbe && Date.now() - lastProbe.ts < 5_000) return lastProbe.ok;
  const p = getPool();
  if (!p) {
    lastProbe = { ts: Date.now(), ok: false };
    return false;
  }
  try {
    await p.query('SELECT 1');
    lastProbe = { ts: Date.now(), ok: true };
    return true;
  } catch (err) {
    log.warn('probe failed', err instanceof Error ? err.message : err);
    lastProbe = { ts: Date.now(), ok: false };
    return false;
  }
}

async function query<R extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<R>> {
  const p = getPool();
  if (!p) {
    throw new Error(
      'Database not configured. Set DATABASE_URL in backend/.env'
    );
  }
  return p.query<R>(text, params as unknown[] | undefined);
}

async function close(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export const db = {
  query,
  isAvailable,
  close,
};

export type DB = typeof db;
