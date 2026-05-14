import { db } from '../db/connection';

export interface Neo4jSettings {
  uri: string;
  user: string;
  password: string;
}

export const SettingsModel = {
  async get<T>(key: string): Promise<T | null> {
    const res = await db.query<{ value: T }>(
      `SELECT value FROM settings WHERE key = $1`,
      [key]
    );
    return res.rows[0]?.value ?? null;
  },

  async set<T>(key: string, value: T): Promise<void> {
    await db.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, JSON.stringify(value)]
    );
  },
};
