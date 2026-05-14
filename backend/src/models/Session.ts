import { v4 as uuid } from 'uuid';
import { db } from '../db/connection';
import type { ChatMessage, SessionRow } from './types';

export const SessionModel = {
  async create(opts: {
    agentId: number | null;
    inputs?: Record<string, unknown>;
  }): Promise<SessionRow> {
    const id = uuid();
    const res = await db.query<SessionRow>(
      `INSERT INTO sessions (id, agent_id, conversation_history, neo4j_context, inputs)
       VALUES ($1, $2, '[]'::jsonb, '{}'::jsonb, $3::jsonb)
       RETURNING id, agent_id, conversation_history, neo4j_context, inputs, created_at, updated_at`,
      [id, opts.agentId, opts.inputs ? JSON.stringify(opts.inputs) : null]
    );
    return res.rows[0];
  },

  async findById(id: string): Promise<SessionRow | null> {
    const res = await db.query<SessionRow>(
      `SELECT id, agent_id, conversation_history, neo4j_context, inputs, created_at, updated_at
       FROM sessions WHERE id = $1`,
      [id]
    );
    return res.rows[0] ?? null;
  },

  async appendMessages(
    id: string,
    messages: ChatMessage[]
  ): Promise<SessionRow | null> {
    const existing = await SessionModel.findById(id);
    if (!existing) return null;
    const merged = [...existing.conversation_history, ...messages];
    const res = await db.query<SessionRow>(
      `UPDATE sessions SET conversation_history = $1::jsonb, updated_at = NOW()
       WHERE id = $2
       RETURNING id, agent_id, conversation_history, neo4j_context, inputs, created_at, updated_at`,
      [JSON.stringify(merged), id]
    );
    return res.rows[0] ?? null;
  },

  async setAgent(id: string, agentId: number): Promise<SessionRow | null> {
    const res = await db.query<SessionRow>(
      `UPDATE sessions SET agent_id = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, agent_id, conversation_history, neo4j_context, inputs, created_at, updated_at`,
      [agentId, id]
    );
    return res.rows[0] ?? null;
  },

  async cacheNeo4jContext(
    id: string,
    context: Record<string, unknown>
  ): Promise<void> {
    await db.query(
      `UPDATE sessions SET neo4j_context = $1::jsonb, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(context), id]
    );
  },
};
