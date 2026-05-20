# Agentic Intelligence Platform (AIP)

A full-stack web application for running Claude agents that perform specialized analysis tasks with multi-step workflows, Neo4j knowledge base integration, and downloadable markdown reports.

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
**AI**: Anthropic Claude (Messages API by default; optional [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) subprocess)  
**Database**: PostgreSQL 13+  
**MCPs**: Neo4j MCP | Filesystem MCP

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

Edit `backend/.env` (see `backend/.env.example`):
```
ANTHROPIC_API_KEY=sk_your_key_here
DATABASE_URL=postgresql://aip_user:aip_password@localhost:5432/aip
NEO4J_URI=neo4j://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
# Optional: AGENT_EXECUTOR_BACKEND=agent-sdk  # default is messages; see agents/README.md
# Optional: ENABLE_CODE_PARSER_TOOLS=false  # global kill-switch for AST MCP tools
# Optional: USE_MCP_FILESYSTEM_TOOLS=true   # default false — omit MCP list_files/read_file; use agent-sdk for Read/Glob/Grep
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
