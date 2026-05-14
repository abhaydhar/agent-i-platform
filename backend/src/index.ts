import { createApp } from './app';
import { claudeAuthMode, env } from './config/env';
import { createLogger } from './utils/logger';
import { db } from './db/connection';
import { Neo4jMCP } from './services/mcps/neo4j';

const log = createLogger('server');

async function probeNeo4j() {
  if (!(await Neo4jMCP.isConfigured())) {
    log.warn('Neo4j not configured — graph tools will return errors to the agent');
    return;
  }
  const result = await Neo4jMCP.testConnection();
  if (result.ok) {
    log.info(`Neo4j connection OK — ${result.message}`);
  } else {
    log.warn(`Neo4j connection FAILED — ${result.message}`);
  }
}

async function main() {
  const app = createApp();

  const ready = await db.isAvailable();
  if (!ready) {
    log.warn(
      'database not reachable — server will start but DB-dependent endpoints will fail until DATABASE_URL is configured.'
    );
  } else {
    log.info('database connection OK');
  }

  await probeNeo4j();

  app.listen(env.port, () => {
    log.info(`listening on http://localhost:${env.port}`);
    log.info(`env=${env.nodeEnv}  model=${env.anthropicModel}`);
    log.info(
      `claude auth=${claudeAuthMode}${
        env.anthropicBaseUrl ? `  baseURL=${env.anthropicBaseUrl}` : ''
      }`
    );
    if (claudeAuthMode === 'none') {
      log.warn(
        'No Anthropic credentials — agent execution will return mock responses. ' +
          'Set ANTHROPIC_API_KEY, or ANTHROPIC_AUTH_TOKEN (+ ANTHROPIC_BASE_URL for proxies).'
      );
    }
    if (!env.neo4jUri) {
      log.warn('NEO4J_URI not set — Neo4j tooling disabled.');
    }
  });
}

main().catch((err) => {
  log.error('fatal startup error', err);
  process.exit(1);
});
