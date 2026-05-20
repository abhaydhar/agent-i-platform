# Agent Definitions

This folder holds optional YAML descriptors for agents. They mirror what the
seed script writes to the `agents` table in PostgreSQL.

The seed script (`backend/src/scripts/seed-agents.ts`) is the authoritative
source for the prototype — the YAML files here are useful as documentation and
as a target for a future "import agent from YAML" admin feature.

## Files

- `data-lineage.yaml` — Data Lineage Analyzer (Phase 5 sample agent)
- `codebase-data-flow-explorer.yaml` — Codebase Data Flow Explorer

## How the runtime resolves an agent

1. The frontend calls `POST /api/agents/:id/run` with form values.
2. The backend loads the agent row from PostgreSQL (`agents` table).
3. `AgentExecutor` runs the agent with the system prompt and the subset of MCP
   tools implied by the agent's `skills` array. **AST / parser tools** (`parse_code_structure`,
   `batch_parse_files`, etc.) register only when the agent has the **`code-ast-parse`**
   skill and `ENABLE_CODE_PARSER_TOOLS` allows it.
   By default it uses the in-process **Messages API** loop (`AGENT_EXECUTOR_BACKEND=messages`).
   Set `AGENT_EXECUTOR_BACKEND=agent-sdk` to use **@anthropic-ai/claude-agent-sdk**
   (Claude Code subprocess; app tools as `mcp__aip__*`, plus built-in **Glob**, **Grep**,
   **Read**, and optional **Bash** when configured).
4. Tools are dispatched via `MCPManager` (Neo4j, optional `code-parser`, and **optional** MCP
   `list_files` / `read_file` only when `USE_MCP_FILESYSTEM_TOOLS=true`). By default filesystem
   MCP is off; use **Agent SDK** built-ins **Glob / Grep / Read** (`AGENT_EXECUTOR_BACKEND=agent-sdk`).
5. Output (markdown + optional mermaid) is persisted to the `outputs` table
   and returned to the frontend.
