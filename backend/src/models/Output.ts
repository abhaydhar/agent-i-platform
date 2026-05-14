import { db } from '../db/connection';
import type { OutputRow } from './types';

export interface OutputInput {
  session_id: string;
  markdown_content: string;
  mermaid_content?: string | null;
  metadata?: Record<string, unknown>;
}

export const OutputModel = {
  async create(input: OutputInput): Promise<OutputRow> {
    const res = await db.query<OutputRow>(
      `INSERT INTO outputs (session_id, markdown_content, mermaid_content, metadata)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id, session_id, markdown_content, mermaid_content, metadata, created_at`,
      [
        input.session_id,
        input.markdown_content,
        input.mermaid_content ?? null,
        JSON.stringify(input.metadata ?? {}),
      ]
    );
    return res.rows[0];
  },

  async latestForSession(sessionId: string): Promise<OutputRow | null> {
    const res = await db.query<OutputRow>(
      `SELECT id, session_id, markdown_content, mermaid_content, metadata, created_at
       FROM outputs WHERE session_id = $1
       ORDER BY id DESC LIMIT 1`,
      [sessionId]
    );
    return res.rows[0] ?? null;
  },

  async listForSession(sessionId: string): Promise<OutputRow[]> {
    const res = await db.query<OutputRow>(
      `SELECT id, session_id, markdown_content, mermaid_content, metadata, created_at
       FROM outputs WHERE session_id = $1
       ORDER BY id ASC`,
      [sessionId]
    );
    return res.rows;
  },
};
