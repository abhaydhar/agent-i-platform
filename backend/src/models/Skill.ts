import { db } from '../db/connection';
import type { SkillRow } from './types';

export interface SkillInput {
  name: string;
  description?: string | null;
  mcp_integrations?: string[];
  skill_definition?: string | null;
  version?: string;
  active?: boolean;
}

const SELECT_COLS =
  'id, name, description, mcp_integrations, skill_definition, version, active, created_at, updated_at';

export const SkillModel = {
  async list(): Promise<SkillRow[]> {
    const res = await db.query<SkillRow>(
      `SELECT ${SELECT_COLS} FROM skills ORDER BY id ASC`
    );
    return res.rows;
  },

  async findById(id: number): Promise<SkillRow | null> {
    const res = await db.query<SkillRow>(
      `SELECT ${SELECT_COLS} FROM skills WHERE id = $1`,
      [id]
    );
    return res.rows[0] ?? null;
  },

  async findByName(name: string): Promise<SkillRow | null> {
    const res = await db.query<SkillRow>(
      `SELECT ${SELECT_COLS} FROM skills WHERE name = $1`,
      [name]
    );
    return res.rows[0] ?? null;
  },

  async upsertByName(input: SkillInput): Promise<SkillRow> {
    const existing = await SkillModel.findByName(input.name);
    if (existing) {
      const res = await db.query<SkillRow>(
        `UPDATE skills SET
          description = $1, mcp_integrations = $2::jsonb, skill_definition = $3,
          version = $4, active = $5, updated_at = NOW()
         WHERE id = $6 RETURNING ${SELECT_COLS}`,
        [
          input.description ?? existing.description,
          JSON.stringify(input.mcp_integrations ?? existing.mcp_integrations),
          input.skill_definition ?? existing.skill_definition,
          input.version ?? existing.version,
          input.active ?? existing.active,
          existing.id,
        ]
      );
      return res.rows[0];
    }
    const res = await db.query<SkillRow>(
      `INSERT INTO skills (name, description, mcp_integrations, skill_definition, version, active)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6)
       RETURNING ${SELECT_COLS}`,
      [
        input.name,
        input.description ?? null,
        JSON.stringify(input.mcp_integrations ?? []),
        input.skill_definition ?? null,
        input.version ?? '1.0.0',
        input.active ?? true,
      ]
    );
    return res.rows[0];
  },

  async update(
    id: number,
    patch: Partial<SkillInput>
  ): Promise<SkillRow | null> {
    const existing = await SkillModel.findById(id);
    if (!existing) return null;
    const res = await db.query<SkillRow>(
      `UPDATE skills SET
        description = $1, mcp_integrations = $2::jsonb, skill_definition = $3,
        version = $4, active = $5, updated_at = NOW()
       WHERE id = $6 RETURNING ${SELECT_COLS}`,
      [
        patch.description ?? existing.description,
        JSON.stringify(patch.mcp_integrations ?? existing.mcp_integrations),
        patch.skill_definition ?? existing.skill_definition,
        patch.version ?? existing.version,
        patch.active ?? existing.active,
        id,
      ]
    );
    return res.rows[0] ?? null;
  },
};
