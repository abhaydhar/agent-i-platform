import { db } from '../db/connection';
import { AgentModel } from '../models/Agent';
import { SkillModel } from '../models/Skill';
import { DATA_LINEAGE_AGENT } from '../services/agents/dataLineage';
import { env } from '../config/env';
import { createLogger } from '../utils/logger';
import { DATA_FLOW_EXPLORER_AGENT } from
  '../services/agents/dataFlowExplorer';

const log = createLogger('seed');

const CODE_ANALYZER_PROMPT = `You are a static-analysis assistant. Use the filesystem tools to explore the requested repository, identify hot files (size, fan-in/fan-out), and surface architectural smells. Produce a concise markdown report with sections: Overview, Hot Files, Modules & Dependencies, Smells & Recommendations.`;

const SKILLS = [
  {
    name: 'data-lineage',
    description: 'Trace field/column lineage across mixed-stack codebases.',
    mcp_integrations: ['filesystem', 'neo4j'],
    version: '1.1.0',
    skill_definition:
      'Reads code files, extracts field references, optionally enriches with Neo4j graph data.',
  },
  {
    name: 'code-analysis',
    description: 'General static analysis of source code repositories.',
    mcp_integrations: ['filesystem'],
    version: '1.0.0',
    skill_definition:
      'Scans files, computes simple metrics (size, fan-out), highlights smells.',
  },
  {
    name: 'neo4j',
    description: 'Read-only Cypher querying with natural-language explanation.',
    mcp_integrations: ['neo4j'],
    version: '1.0.0',
    skill_definition:
      'Translates user questions into Cypher and explains result sets.',
  },
];

const CODE_ANALYZER_AGENT = {
  name: 'Code Analyzer',
  description:
    'Static analysis across a codebase: dependency graphs, hot files, complexity hotspots, and architectural smells.',
  icon: 'code',
  capability: 'Static analysis & architecture review',
  skills: ['code-analysis'],
  active: true,
  system_prompt: CODE_ANALYZER_PROMPT,
  input_params: [
    {
      name: 'repo_path',
      label: 'Repository Path',
      type: 'string' as const,
      required: true,
      placeholder: 'C:\\path\\to\\repo or src/ relative to FS_SANDBOX_ROOT',
    },
    {
      name: 'language',
      label: 'Primary Language',
      type: 'select' as const,
      required: false,
      default: 'auto',
      options: [
        { label: 'Auto-detect', value: 'auto' },
        { label: 'TypeScript', value: 'typescript' },
        { label: 'Python', value: 'python' },
        { label: 'C#', value: 'csharp' },
      ],
    },
    {
      name: 'notes',
      label: 'Notes for the agent',
      type: 'text' as const,
      required: false,
      placeholder: 'Focus on the order processing module...',
    },
  ],
};

async function main() {
  console.log('=== Starting seed script ===');
  console.log('DATABASE_URL:', env.databaseUrl ? 'configured' : 'NOT SET');

  if (!env.databaseUrl) {
    console.error('ERROR: DATABASE_URL not set');
    log.error('DATABASE_URL not set');
    process.exit(1);
  }

  console.log('Checking database connection...');
  const ok = await db.isAvailable();
  if (!ok) {
    console.error('ERROR: database not reachable');
    log.error('database not reachable');
    process.exit(1);
  }
  console.log('✓ Database connected');

  console.log('\nSeeding skills...');
  for (const skill of SKILLS) {
    const s = await SkillModel.upsertByName(skill);
    console.log(`✓ skill   ${s.name} (id=${s.id})`);
    log.info(`skill   ${s.name} (id=${s.id})`);
  }

  console.log('\nSeeding agents...');
  for (const agent of [DATA_LINEAGE_AGENT,
  DATA_FLOW_EXPLORER_AGENT]) {
    console.log(`  Processing agent: ${agent.name}`);
    console.log(`  Input params count: ${agent.input_params.length}`);
    const a = await AgentModel.upsertByName(agent);
    console.log(`✓ agent   ${a.name} (id=${a.id})`);
    log.info(`agent   ${a.name} (id=${a.id})`);
  }

  console.log('\n=== Seed complete ===');
  log.info('seed complete');
  await db.close();
}

main().catch((err) => {
  log.error('seed failed', err);
  process.exit(1);
});
