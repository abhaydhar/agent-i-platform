# Agent Definitions

This folder holds optional YAML descriptors for agents. They mirror what the
seed script writes to the `agents` table in PostgreSQL.

The seed script (`backend/src/scripts/seed-agents.ts`) is the authoritative
source for the prototype — the YAML files here are useful as documentation and
as a target for a future "import agent from YAML" admin feature.

## Files

- `data-lineage.yaml` — Data Lineage Analyzer (Phase 5 sample agent)

## How the runtime resolves an agent

1. The frontend calls `POST /api/agents/:id/run` with form values.
2. The backend loads the agent row from PostgreSQL (`agents` table).
3. `AgentExecutor` instantiates a Claude tool-use loop with the system prompt
   and the subset of MCP tools implied by the agent's `skills` array.
4. Tools are dispatched via `MCPManager` (`filesystem.ts`, `neo4j.ts`).
5. Output (markdown + optional mermaid) is persisted to the `outputs` table
   and returned to the frontend.
