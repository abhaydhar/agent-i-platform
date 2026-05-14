import { db } from '../db/connection';
import type { AgentRow, InputParam } from './types';

export interface AgentInput {
  name: string;
  description?: string | null;
  icon?: string | null;
  capability?: string | null;
  system_prompt: string;
  skills?: string[];
  input_params?: InputParam[];
  active?: boolean;
}

const SELECT_COLS =
  'id, name, description, icon, capability, system_prompt, skills, input_params, active, created_at, updated_at';

export const AgentModel = {
  async list(opts: { activeOnly?: boolean } = {}): Promise<AgentRow[]> {
    const where = opts.activeOnly ? 'WHERE active = TRUE' : '';
    const res = await db.query<AgentRow>(
      `SELECT ${SELECT_COLS} FROM agents ${where} ORDER BY id ASC`
    );
    return res.rows;
  },

  async findById(id: number): Promise<AgentRow | null> {
    const res = await db.query<AgentRow>(
      `SELECT ${SELECT_COLS} FROM agents WHERE id = $1`,
      [id]
    );
    return res.rows[0] ?? null;
  },

  async findByName(name: string): Promise<AgentRow | null> {
    const res = await db.query<AgentRow>(
      `SELECT ${SELECT_COLS} FROM agents WHERE name = $1`,
      [name]
    );
    return res.rows[0] ?? null;
  },

  async create(input: AgentInput): Promise<AgentRow> {
    const res = await db.query<AgentRow>(
      `INSERT INTO agents
        (name, description, icon, capability, system_prompt, skills, input_params, active)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
       RETURNING ${SELECT_COLS}`,
      [
        input.name,
        input.description ?? null,
        input.icon ?? null,
        input.capability ?? null,
        input.system_prompt,
        JSON.stringify(input.skills ?? []),
        JSON.stringify(input.input_params ?? []),
        input.active ?? true,
      ]
    );
    return res.rows[0];
  },

  async update(
    id: number,
    patch: Partial<AgentInput>
  ): Promise<AgentRow | null> {
    const existing = await AgentModel.findById(id);
    if (!existing) return null;
    const merged: AgentInput = {
      name: patch.name ?? existing.name,
      description: patch.description ?? existing.description,
      icon: patch.icon ?? existing.icon,
      capability: patch.capability ?? existing.capability,
      system_prompt: patch.system_prompt ?? existing.system_prompt,
      skills: patch.skills ?? existing.skills,
      input_params: patch.input_params ?? existing.input_params,
      active: patch.active ?? existing.active,
    };
    const res = await db.query<AgentRow>(
      `UPDATE agents SET
        name = $1, description = $2, icon = $3, capability = $4,
        system_prompt = $5, skills = $6::jsonb, input_params = $7::jsonb,
        active = $8, updated_at = NOW()
       WHERE id = $9 RETURNING ${SELECT_COLS}`,
      [
        merged.name,
        merged.description ?? null,
        merged.icon ?? null,
        merged.capability ?? null,
        merged.system_prompt,
        JSON.stringify(merged.skills ?? []),
        JSON.stringify(merged.input_params ?? []),
        merged.active ?? true,
        id,
      ]
    );
    return res.rows[0] ?? null;
  },

  async softDelete(id: number): Promise<boolean> {
    const res = await db.query(
      `UPDATE agents SET active = FALSE, updated_at = NOW() WHERE id = $1`,
      [id]
    );
    return (res.rowCount ?? 0) > 0;
  },

  async upsertByName(input: AgentInput): Promise<AgentRow> {
    const found = await AgentModel.findByName(input.name);
    if (found) {
      const updated = await AgentModel.update(found.id, input);
      if (updated) return updated;
    }
    return AgentModel.create(input);
  },
};
