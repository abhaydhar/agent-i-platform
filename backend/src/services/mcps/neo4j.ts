import neo4j, { type Driver } from 'neo4j-driver';
import { env } from '../../config/env';
import { SettingsModel, type Neo4jSettings } from '../../models/Settings';
import { createLogger } from '../../utils/logger';

const log = createLogger('neo4j');

let driver: Driver | null = null;
let cachedConfig: Neo4jSettings | null = null;

async function loadConfig(): Promise<Neo4jSettings | null> {
  let cfg: Neo4jSettings | null = null;
  try {
    cfg = await SettingsModel.get<Neo4jSettings>('neo4j');
  } catch {
    cfg = null;
  }
  if (cfg && cfg.uri) return cfg;
  if (env.neo4jUri && env.neo4jUser && env.neo4jPassword) {
    return {
      uri: env.neo4jUri,
      user: env.neo4jUser,
      password: env.neo4jPassword,
    };
  }
  return null;
}

async function getDriver(): Promise<Driver | null> {
  const cfg = await loadConfig();
  if (!cfg) return null;
  if (
    driver &&
    cachedConfig &&
    cachedConfig.uri === cfg.uri &&
    cachedConfig.user === cfg.user
  ) {
    return driver;
  }
  if (driver) {
    await driver.close().catch(() => undefined);
  }
  driver = neo4j.driver(cfg.uri, neo4j.auth.basic(cfg.user, cfg.password), {
    connectionTimeout: 5_000,
  });
  cachedConfig = cfg;
  return driver;
}

export const Neo4jMCP = {
  async isConfigured(): Promise<boolean> {
    const cfg = await loadConfig();
    return cfg !== null;
  },

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const d = await getDriver();
    if (!d) return { ok: false, message: 'Neo4j is not configured' };
    try {
      const session = d.session();
      try {
        await session.run('RETURN 1 AS ok');
        return { ok: true, message: 'Connection successful' };
      } finally {
        await session.close();
      }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  },

  async runCypher(
    cypher: string,
    params: Record<string, unknown> = {}
  ): Promise<{ records: Record<string, unknown>[] }> {
    const d = await getDriver();
    if (!d) throw new Error('Neo4j not configured');
    const session = d.session();
    try {
      const result = await session.run(cypher, params);
      const records = result.records.map((r) => {
        const obj: Record<string, unknown> = {};
        for (const k of r.keys) {
          obj[String(k)] = r.get(k);
        }
        return obj;
      });
      return { records };
    } finally {
      await session.close();
    }
  },

  async findFieldLineage(opts: {
    fieldName: string;
    runId?: string;
  }): Promise<{ records: Record<string, unknown>[] }> {
    const cypher = `
      MATCH (v:Variable {name: $field})
      OPTIONAL MATCH (v)<-[:CONTAINS_VARIABLE]-(s:Snippet)
      OPTIONAL MATCH (s)<-[:CONTAINS_DB_CALLS]-(db:Dbcall)
      RETURN v, s, db
      LIMIT 50
    `;
    return Neo4jMCP.runCypher(cypher, {
      field: opts.fieldName,
      runId: opts.runId ?? null,
    });
  },

  async close() {
    if (driver) {
      await driver.close().catch((e) => log.warn('close error', e));
      driver = null;
      cachedConfig = null;
    }
  },
};

export type Neo4jTool = typeof Neo4jMCP;
