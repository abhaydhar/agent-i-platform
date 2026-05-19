# Agentic Intelligence Platform (AIP)

A full-stack web application for running Claude agents that perform specialized analysis tasks with multi-step workflows, Neo4j knowledge base integration, and downloadable markdown reports.

## What makes AIP "agentic"

A normal LLM app answers in one shot. AIP is **agentic** because each agent is given a goal and a toolbox, and Claude itself decides which tool to call, looks at the result, and chooses the next step — in a loop — until it decides it is done. Concretely:

1. **Declarative goals, not scripts.** Each agent is defined in YAML (`agents/*.yaml`) with a system prompt, skills, and input parameters. The backend never hard-codes the order of steps.
2. **Real tools via MCPs.** Skills map to MCP tools (`list_files`, `read_file`, `neo4j_query`, code parsers) that read your filesystem and Neo4j graph.
3. **Autonomous reason → act → observe loop.** `backend/src/services/AgentExecutor.ts` calls the model with `tools`, runs whichever tool the model chose, feeds the result back as a `tool_result`, and repeats until `stop_reason !== 'tool_use'`. The model controls termination, not the code.
4. **Guardrails around autonomy.** A per-run filesystem sandbox root, a max-iterations ceiling with a forced-conclude turn, tool-result size clamping, and a full per-iteration trace surfaced in the report.

> **Note on the SDK.** Despite the name, this project does **not** use `@anthropic-ai/claude-agent-sdk`. It uses the base `@anthropic-ai/sdk` (Messages API) and implements the agent loop directly in `AgentExecutor.ts`. The "agentic" behavior is a property of that loop and the MCP tool layer, not of a library label.

## Features

- **Agent Selection & Execution**: Run pre-configured or custom agents with dynamic input forms
- **Markdown Output**: Generate and preview formatted markdown reports
- **Chat Interface**: Follow-up queries with context-aware Claude responses
- **Admin Dashboard**: Manage agents, skills, and system configurations
- **Data Lineage Agent**: Trace data flow across multiple tech stacks (C#, Python, PL/SQL)
- **Neo4j Integration**: Query and analyze knowledge graphs
- **Docker Support**: One-command deployment with Docker Compose

## Tech Stack

**Backend**: Node.js 18+ | Express | TypeScript | PostgreSQL  
**Frontend**: React 18+ | Vite | TypeScript | Tailwind CSS  
**AI**: Anthropic Claude (Messages API via `@anthropic-ai/sdk`) with a custom in-house agent loop (`backend/src/services/AgentExecutor.ts`)  
**Database**: PostgreSQL 13+  
**MCPs**: Neo4j MCP | Filesystem MCP | Code Parser MCP

## Prerequisites

- Node.js 18+
- Docker & Docker Compose (for containerized deployment)
- PostgreSQL 13+ (or use Docker)
- Anthropic API Key
- Neo4j instance (optional, for full lineage tracing)

## Quick Start (Local Development)

### 1. Clone and Install

```bash
cd aip
npm install
```

### 2. Set Up Environment

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Edit `backend/.env`:
```
ANTHROPIC_API_KEY=sk_your_key_here
DATABASE_URL=postgresql://aip_user:aip_password@localhost:5432/aip
NEO4J_URI=neo4j://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
```

Edit `frontend/.env`:
```
VITE_API_URL=http://localhost:5000
```

### 3. Set Up Database

Using Docker:
```bash
docker run --name aip-postgres \
  -e POSTGRES_DB=aip \
  -e POSTGRES_USER=aip_user \
  -e POSTGRES_PASSWORD=aip_password \
  -p 5432:5432 \
  -d postgres:15-alpine
```

Or use Docker Compose (recommended):
```bash
docker-compose up -d postgres
```

### 4. Run Migrations & Seed

```bash
npm run migrate --workspace=backend
npm run seed --workspace=backend
```

### 5. Start Development Servers

In separate terminals:

```bash
# Terminal 1: Backend
npm run backend

# Terminal 2: Frontend
npm run frontend
```

Access the app at `http://localhost:3000`

## Docker Deployment

### One-Command Start

```bash
docker-compose up --build
```

This starts:
- PostgreSQL database
- Express backend (port 5000)
- React frontend (port 3000)

### Access

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- API Health: http://localhost:5000/health

## Project Structure

```
aip/
├── backend/
│   ├── src/
│   │   ├── app.ts                 # Express setup
│   │   ├── index.ts               # Server entry
│   │   ├── db/                    # Database
│   │   │   ├── connection.ts
│   │   │   ├── migrate.ts
│   │   │   └── migrations/
│   │   ├── routes/                # API routes
│   │   ├── models/                # DB models
│   │   ├── services/              # Business logic
│   │   └── mcps/                  # MCP integrations
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx               # React entry
│   │   ├── App.tsx                # Root component
│   │   ├── pages/                 # Route pages
│   │   ├── components/            # Reusable components
│   │   ├── services/              # API clients
│   │   └── index.css              # Styles
│   ├── vite.config.ts
│   └── package.json
│
├── docker-compose.yml
├── Dockerfile
└── README.md
```

## Available Scripts

### Backend
```bash
npm run dev --workspace=backend          # Start dev server
npm run build --workspace=backend        # Build TypeScript
npm run migrate --workspace=backend      # Run DB migrations
npm run seed --workspace=backend         # Seed default agents
npm run lint --workspace=backend         # Lint code
npm run type-check --workspace=backend   # Type check
```

### Frontend
```bash
npm run dev --workspace=frontend         # Start Vite dev server
npm run build --workspace=frontend       # Build for production
npm run preview --workspace=frontend     # Preview production build
npm run lint --workspace=frontend        # Lint code
npm run type-check --workspace=frontend  # Type check
```

## API Endpoints

### Agents
- `GET /api/agents` - List all agents
- `POST /api/agents/:id/run` - Execute agent
- `GET /api/agents/:id/config` - Get agent config
- `POST /api/agents` - Create agent (admin)
- `PUT /api/agents/:id` - Update agent (admin)
- `DELETE /api/agents/:id` - Delete agent (admin)

### Conversations
- `GET /api/conversations/:sessionId` - Get conversation history
- `POST /api/conversations/:sessionId/message` - Send follow-up query

### Skills
- `GET /api/skills` - List all skills
- `PUT /api/skills/:id` - Update skill (admin)

## Data Lineage Agent

The Data Lineage Analyzer traces data flow across your codebase:

**Input Parameters**:
- `file_paths`: Glob patterns for code files (e.g., `/data/**/*.{cs,py,sql}`)
- `target_fields`: Fields to trace (comma-separated)
- `trace_depth`: How deep to recurse (default: 3)
- `include_diagram`: Generate Mermaid diagram (boolean)

**Output**:
- Markdown report with lineage chains
- Table dependency matrix
- Code snippet references with line numbers
- Optional Mermaid flowchart

## Configuration

### Neo4j Connection

Set in `backend/.env`:
```
NEO4J_URI=neo4j://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
```

### Anthropic API

Get your API key from https://console.anthropic.com/account/keys

### Environment Variables

See `backend/.env.example` and `frontend/.env.example` for all available options.

## Development Workflow

1. **Make changes** to backend or frontend code
2. **Dev servers auto-reload** on file changes
3. **Test manually** in the browser
4. **Check types**: `npm run type-check --workspaces`
5. **Lint code**: `npm run lint --workspaces`
6. **Commit and push**

## Troubleshooting

### Database Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
- Ensure PostgreSQL is running
- Check `DATABASE_URL` in `backend/.env`
- Run `docker-compose up -d postgres`

### API Not Responding
- Check backend is running: `npm run backend`
- Verify port 5000 is not in use
- Check backend logs for errors

### Frontend Can't Connect to Backend
- Ensure `VITE_API_URL` is set in `frontend/.env`
- Check backend is running and healthy: `curl http://localhost:5000/health`
- Check browser console for CORS errors

## Testing

Manual test workflows:

1. **Run Data Lineage Agent**
   - Upload code files
   - Request lineage for a field
   - Verify markdown output and diagram

2. **Follow-up Queries**
   - Run agent
   - Ask follow-up question in chat
   - Verify context is maintained

3. **Admin CRUD**
   - Create new agent
   - Edit agent config
   - Verify it appears in landing page

## Performance

- Agent execution: < 30 seconds for typical 5-file analysis
- Chat response: < 5 seconds
- Supports 1-5 concurrent users (MVP)

## Security Notes

**Development/Prototype**: 
- No authentication required
- Assumes trusted environment
- Do not expose to untrusted networks

**Production Considerations**:
- Add authentication/authorization
- Use HTTPS
- Implement rate limiting
- Add input validation & sanitization
- Use secrets management

## Contributing

1. Create feature branch
2. Follow code style (ESLint + Prettier)
3. Type-check: `npm run type-check --workspaces`
4. Test changes locally
5. Create PR with description

## License

Proprietary

## Support

For issues and questions, contact the development team.

---

**Last Updated**: 2025-05-14  
**Version**: 1.0.0-MVP
