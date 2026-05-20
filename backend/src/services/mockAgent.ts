import type { RunRequest } from './agentExecution/types';
import { FilesystemMCP } from './mcps/filesystem';

interface MockResult {
  markdown: string;
  mermaid: string | null;
}

const LINEAGE_MARKDOWN = `# Data Lineage Analysis Report

## Executive Summary

- **Analysis Date**: ${new Date().toISOString().slice(0, 10)}
- **Files Scanned**: see file list below
- **Findings**: \`CUSTOMER_ID\` is read by 3 processes and written by 1 daily batch (mock).

## Table Dependency Matrix

| Field | Write Source | Read By | Tech | Frequency |
|-------|--------------|---------|------|-----------|
| CUSTOMER_ID | ERP_Daily.sql | OrderProcessor.cs, DataSync.py | SQL, C#, Python | 1x/day, continuous |
| ORDER_ID    | OrderProcessor.cs | Reporting.py | C#, Python | Real-time, hourly |

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

- CUSTOMER_ID written by one process daily; read continuously by others
- No orphaned fields detected
- Recommend adding logging for ID transformations between systems
`;

const LINEAGE_MERMAID = `flowchart LR
  ERP[ERP_Daily.sql] -- writes CUSTOMER_ID --> CUST[(CUSTOMERS)]
  CUST -- read --> OP[OrderProcessor.cs]
  OP -- writes ORDER_ID --> ORD[(ORDERS)]
  ORD -- read --> DS[DataSync.py]
  ORD -- read --> RP[Reporting.py]
`;

export async function buildMockRun(req: RunRequest): Promise<MockResult> {
  if (req.userMessage) {
    return {
      markdown: `**Mock follow-up response:**\n\nI received your question: _"${req.userMessage}"_.\n\nIn mock mode (no \`ANTHROPIC_API_KEY\`) I can't generate a real follow-up. Configure your key in \`backend/.env\` to enable Claude-powered replies that take prior agent output and conversation history into account.`,
      mermaid: null,
    };
  }

  if (req.agent.skills.includes('data-lineage')) {
    const includeDiagram = Boolean(req.inputs.include_diagram);
    let fileList = '';
    try {
      const files = await FilesystemMCP.listFiles({
        extensions: ['cs', 'py', 'sql', 'pls', 'ts'],
        maxFiles: 10,
        sandboxRoot: req.fsSandboxRoot,
      });
      if (files.length > 0) {
        fileList =
          '\n\n## Files Discovered (mock scan)\n\n' +
          files.map((f) => `- \`${f.path}\` (${f.bytes} bytes)`).join('\n');
      }
    } catch {
      /* ignore */
    }
    return {
      markdown: LINEAGE_MARKDOWN + fileList,
      mermaid: includeDiagram ? LINEAGE_MERMAID : null,
    };
  }

  const md = [
    `# ${req.agent.name} — Mock Result`,
    '',
    '_Running in mock mode (no Anthropic API key configured)._',
    '',
    '## Inputs',
    '```json',
    JSON.stringify(req.inputs, null, 2),
    '```',
    '',
    '## Notes',
    '',
    `- Skills: ${req.agent.skills.join(', ') || '(none)'}`,
    '- Configure `ANTHROPIC_API_KEY` to enable real Claude-powered execution.',
  ].join('\n');

  return { markdown: md, mermaid: null };
}
