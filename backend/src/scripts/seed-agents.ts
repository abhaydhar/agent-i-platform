import { db } from '../db/connection';
import { AgentModel } from '../models/Agent';
import { SkillModel } from '../models/Skill';
import { DATA_LINEAGE_AGENT } from '../services/agents/dataLineage';
import { env } from '../config/env';
import { createLogger } from '../utils/logger';

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
      placeholder: 'src/',
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
  if (!env.databaseUrl) {
    log.error('DATABASE_URL not set');
    process.exit(1);
  }
  const ok = await db.isAvailable();
  if (!ok) {
    log.error('database not reachable');
    process.exit(1);
  }

  for (const skill of SKILLS) {
    const s = await SkillModel.upsertByName(skill);
    log.info(`skill   ${s.name} (id=${s.id})`);
  }

  for (const agent of [DATA_LINEAGE_AGENT, CODE_ANALYZER_AGENT]) {
    const a = await AgentModel.upsertByName(agent);
    log.info(`agent   ${a.name} (id=${a.id})`);
  }

  log.info('seed complete');
  await db.close();
}

main().catch((err) => {
  log.error('seed failed', err);
  process.exit(1);
});
