import type { Agent, AgentRunResponse } from '@/types';

export const MOCK_AGENTS: Agent[] = [
  {
    id: 1,
    name: 'Data Lineage Analyzer',
    description:
      'Trace data flow across C#, Python, and PL/SQL code. Produces a detailed lineage report plus an optional Mermaid diagram.',
    icon: 'lineage',
    capability: 'Multi-stack data lineage tracing',
    skills: ['data-lineage', 'code-analysis'],
    active: true,
    input_params: [
      {
        name: 'file_paths',
        label: 'File Paths',
        type: 'paths',
        required: true,
        placeholder: '/data/code/*.cs, /data/sql/*.sql',
        description: 'One path or glob per line. Supports .cs, .py, .sql, .pls files.',
      },
      {
        name: 'target_fields',
        label: 'Target Fields',
        type: 'string',
        required: true,
        placeholder: 'CUSTOMER_ID, ORDER_DATE',
        description: 'Comma-separated field/column names to trace.',
      },
      {
        name: 'trace_depth',
        label: 'Trace Depth',
        type: 'number',
        required: false,
        default: 3,
        min: 1,
        max: 10,
        step: 1,
        description: 'How many hops to recurse when following references.',
      },
      {
        name: 'include_diagram',
        label: 'Include Mermaid diagram',
        type: 'boolean',
        required: false,
        default: false,
        description: 'Emit a Mermaid flowchart alongside the markdown.',
      },
      {
        name: 'tech_stack',
        label: 'Tech Stack',
        type: 'multiselect',
        required: false,
        default: ['csharp', 'python', 'plsql'],
        options: [
          { label: 'C#', value: 'csharp' },
          { label: 'Python', value: 'python' },
          { label: 'PL/SQL', value: 'plsql' },
        ],
      },
    ],
  },
  {
    id: 2,
    name: 'Code Analyzer',
    description:
      'Static analysis across a codebase: dependency graphs, hot files, complexity hotspots, and architectural smells.',
    icon: 'code',
    capability: 'Static analysis & architecture review',
    skills: ['code-analysis'],
    active: true,
    input_params: [
      {
        name: 'repo_path',
        label: 'Repository Path',
        type: 'string',
        required: true,
        placeholder: '/path/to/repo',
      },
      {
        name: 'language',
        label: 'Primary Language',
        type: 'select',
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
        type: 'text',
        required: false,
        placeholder: 'Focus on the order processing module...',
      },
    ],
  },
  {
    id: 3,
    name: 'Knowledge Graph Explorer',
    description:
      'Run guided Cypher queries against the configured Neo4j instance and explain results in plain English.',
    icon: 'graph',
    capability: 'Neo4j querying & explanation',
    skills: ['neo4j'],
    active: false,
    input_params: [
      {
        name: 'question',
        label: 'Question',
        type: 'text',
        required: true,
        placeholder: 'Which systems read CUSTOMER_ID more than 10 times per day?',
      },
    ],
  },
];

const SAMPLE_MARKDOWN = `# Data Lineage Analysis Report

## Executive Summary

- **Analysis Date**: 2025-05-14
- **Files Scanned**: 5 (C#: 2, Python: 1, PL/SQL: 2)
- **Fields Traced**: \`CUSTOMER_ID\`, \`ORDER_ID\`
- **Findings**: \`CUSTOMER_ID\` is read by 3 processes and written by 1 daily batch.

## Table Dependency Matrix

| Field | Write Source | Read By | Tech | Frequency |
|-------|--------------|---------|------|-----------|
| CUSTOMER_ID | ERP_Daily.sql | OrderProcessor.cs, DataSync.py | SQL, C#, Python | 1x/day, continuous |
| ORDER_ID | OrderProcessor.cs | Reporting.py | C#, Python | Real-time, hourly |

## Detailed Lineage: CUSTOMER_ID

### Origin

**File**: \`ERP_Daily.sql\` (Line 42)

\`\`\`sql
SELECT CUSTOMER_ID, CUSTOMER_NAME
FROM master_customer_db
WHERE updated_at >= TRUNC(SYSDATE);
\`\`\`

### Transform (C#)

**File**: \`OrderProcessor.cs\` (Line 15–25)

\`\`\`csharp
public class OrderService {
    public void ProcessOrder(int customerId) {
        var customer = _db.Customers.Find(customerId);
        // ...
    }
}
\`\`\`

### Consumer (Python)

**File**: \`DataSync.py\` (Line 88)

\`\`\`python
df = pd.read_sql(
    "SELECT * FROM orders WHERE CUSTOMER_ID = ?",
    conn,
    params=(customer_id,),
)
\`\`\`

## Potential Issues

- ⚠️ \`CUSTOMER_ID\` written by one process daily; read continuously by others.
- ✓ No orphaned fields found.
- ℹ️ Recommend adding logging for ID transformations between systems.
`;

const SAMPLE_MERMAID = `flowchart LR
  ERP[ERP_Daily.sql] -- writes CUSTOMER_ID --> CUST[(CUSTOMERS)]
  CUST -- read --> OP[OrderProcessor.cs]
  OP -- writes ORDER_ID --> ORD[(ORDERS)]
  ORD -- read --> DS[DataSync.py]
  ORD -- read --> RP[Reporting.py]
`;

export function buildMockRunResponse(
  agent: Agent,
  inputs: Record<string, unknown>
): AgentRunResponse {
  const includeDiagram = Boolean(inputs.include_diagram);
  const targetFields = (inputs.target_fields as string) || 'CUSTOMER_ID';

  const markdown =
    agent.name === 'Data Lineage Analyzer'
      ? SAMPLE_MARKDOWN
      : `# ${agent.name} — Result\n\n_This is a mock response while the backend is not connected._\n\n**Inputs received:**\n\n\`\`\`json\n${JSON.stringify(inputs, null, 2)}\n\`\`\`\n\nFields/topic: **${targetFields}**\n`;

  return {
    sessionId: `mock-${Date.now()}`,
    markdown,
    mermaid: includeDiagram ? SAMPLE_MERMAID : undefined,
    metadata: {
      executionMs: 1200,
      tokensUsed: 1843,
      filesAnalyzed: 5,
      model: 'claude-3-5-sonnet (mock)',
    },
  };
}
