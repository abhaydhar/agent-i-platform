# Agentic Web Application - Product Requirements Document & Implementation Plan

## Context

Building a prototype web application using Node.js + Express that enables users to run Claude agents (powered by anthropic-ai/claude-agent-sdk) with nuanced outputs. The app will support multi-step agent workflows, Neo4j knowledge base integration, downloadable markdown reports, and a sample "Data Lineage Agent" that analyzes code across multiple tech stacks. This is a local development MVP focused on demonstrating agent capabilities and the Neo4j + Claude integration pattern.

---

## PRD: Product Specification

### 1. Overview

**Product Name**: Agentic Intelligence Platform (AIP)  
**Type**: Local Development Prototype  
**Tech Stack**: Node.js + Express + React (frontend), PostgreSQL (SQLite fallback), Neo4j MCP  
**Primary Use Case**: Demonstrate agent-driven analysis workflows (data lineage tracing as MVP)

---

### 2. Core Features

#### 2.1 Agent Selection & Execution UI
- **Landing page**: Clean grid/list view of available agents
- **Agent card**: Agent name, description, icon, and one-line capability summary
- **"Run Agent" flow**:
  - User clicks agent → opens a modal/side panel with input form
  - Form fields vary per agent (e.g., file paths, database connection params, query scope)
  - User submits → agent executes (shows spinner/progress)
  - Output renders in a split-pane or new tab (md + preview)
- **No authentication** (prototype): open-access, dev-mode only

#### 2.2 Output Display & Management
- **Output viewer**:
  - Left pane: raw markdown code (with syntax highlighting)
  - Right pane: rendered markdown preview (with formatting, tables, code blocks)
  - **Toggle controls**: MD source ↔ Preview
- **Download**: User can export output as `.md` or `.html`
- **Copy to Clipboard**: Quick-copy full markdown

#### 2.3 Chat Interface (Follow-up Queries)
- **Chat window**: Messages UI similar to ChatGPT (user message left, assistant response right)
- **Conversation history**: Stored per-session; shows prior messages and outputs
- **Features**:
  - User types follow-up question in input box
  - App maintains **context** from initial agent output + Neo4j data
  - User can **switch agents** (dropdown in chat header)
  - Each query fires to Claude with:
    - Prior agent output as context
    - Prior messages in conversation
    - Updated Neo4j query results if needed
  - Response renders in chat (markdown formatted)
  - Option to refine or re-run with new parameters

#### 2.4 Admin Dashboard (Agent & Skill Management)
- **Agent Management**:
  - List of agents (name, description, active/inactive, created date)
  - **Create/Edit Agent**: Form to define:
    - Agent name & description
    - Associated skills (multi-select from available skills)
    - System prompt template (textarea, supports variables like `{filename}`, `{context}`)
    - Input parameters (name, type, required/optional, placeholder)
  - **Delete Agent** (soft delete, logs in audit trail if time permits)

- **Skill Management**:
  - List of skills with metadata (name, description, version, MCP integrations used)
  - **Edit Skill**: Update skill definition, MCP configuration, or prompt enhancements
  - **Bulk actions**: Enable/disable skills across multiple agents

- **Neo4j Connection Settings** (if supporting user ingest):
  - URI, username, password fields
  - Test connection button
  - Display current schema version (if available)

#### 2.5 Data Lineage Agent (Sample Agent)
**Name**: Data Lineage Analyzer  
**Capability**: Trace data flow across C#, Python, and PL/SQL code files; produce detailed lineage report and visual diagram.

**Input Parameters**:
- `file_paths`: Array of code file paths or directory to scan
- `target_fields`: Fields/tables to trace (comma-separated)
- `trace_depth`: How deep to recurse (default: 3)
- `output_format`: "md" (default) or "mmd" (Mermaid diagram)

**Workflow**:
1. User selects agent, uploads files or specifies paths
2. Agent uses Filesystem MCP to read file contents
3. Agent queries Neo4j (via Neo4j MCP) to find existing lineage nodes, or builds new analysis
4. Claude iterates through files, building a lineage graph (nodes: table, column, code snippet; edges: reads, writes, uses)
5. Agent produces markdown report with:
   - Executive summary (what was analyzed, key findings)
   - Table dependency matrix (which tables read/write what columns)
   - Field lineage chain (origin → transformations → consumers)
   - Tech stack breakdown (C# code fragments, SQL queries, Python transformations)
   - Mermaid diagram (optional) showing visual flow
6. Output downloadable as `.md` + `.mmd` (if diagram selected)

**Example Output Structure**:
```
# Data Lineage Report

## Analysis Summary
- Files analyzed: 5 (3 C#, 1 Python, 1 PL/SQL)
- Time range: 2025-01-01 to 2025-05-14
- Trace depth: 3 levels

## Table Dependency Matrix
| Table | Read by | Write by | Notes |
|-------|---------|----------|-------|
| CUSTOMERS | DataSync.py | ERP_Load.sql | Master data |
| ORDERS | OrderProcessor.cs | ... | Daily sync |

## Field Lineage: CUSTOMER_ID
```sql
-- Origin (PL/SQL)
SELECT CUSTOMER_ID FROM CUSTOMERS WHERE ...

-- Transform (C#)
public void ProcessOrder(int customerId) { 
  var orders = db.GetOrders(customerId); 
  ...
}

-- Consumer (Python)
df = pd.read_sql("SELECT * FROM ORDERS WHERE CUSTOMER_ID = ?", conn)
```

## Visual Diagram
[Mermaid flowchart showing full lineage]
```

---

### 3. Technical Architecture

#### 3.1 Backend (Express.js)
- **Routes**:
  - `GET /api/agents` - List all agents
  - `POST /api/agents/:id/run` - Execute agent with input parameters
  - `GET /api/agents/:id/config` - Get agent configuration
  - `PUT /api/agents/:id` - Update agent (admin)
  - `POST /api/agents/:id` - Create agent (admin)
  - `DELETE /api/agents/:id` - Delete agent (admin)
  - `GET /api/conversations/:sessionId` - Fetch conversation history
  - `POST /api/conversations/:sessionId/message` - Send follow-up query
  - `GET /api/skills` - List all skills
  - `PUT /api/skills/:id` - Update skill definition (admin)

- **Session Management**: 
  - Session ID in URL or cookie
  - Session data: agent_id, conversation_history, neo4j_context, last_output
  - Stored in DB (PostgreSQL sessions table or SQLite)

- **Agent Execution**:
  - Load agent config from DB
  - Initialize Claude Agent with system prompt + skills
  - Pass input parameters, Neo4j context
  - Stream or wait for completion
  - Store output + metadata in DB
  - Return MD + metadata to frontend

#### 3.2 Frontend (React)
- **Pages**:
  - `/` - Agent selection landing page
  - `/agent/:id/run` - Agent input form + output viewer
  - `/chat/:sessionId` - Chat interface (follows from run page)
  - `/admin/agents` - Manage agents
  - `/admin/skills` - Manage skills
  - `/admin/settings` - Neo4j connection config

- **Components**:
  - `AgentGrid` - Display available agents
  - `AgentForm` - Input form for agent parameters
  - `OutputViewer` - MD source + preview panes
  - `ChatWindow` - Chat messages + input
  - `AdminTable` - Generic table for CRUD operations
  - `FormBuilder` - Dynamic form generation from agent config

#### 3.3 Database Schema (PostgreSQL)
```sql
-- Agents
CREATE TABLE agents (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  system_prompt TEXT NOT NULL,
  skills JSON, -- e.g., ["data-lineage", "code-analysis"]
  input_params JSON, -- form fields definition
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Skills
CREATE TABLE skills (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  mcp_integrations JSON, -- ["neo4j", "filesystem"]
  skill_definition TEXT, -- YAML or JSON defining the skill
  version VARCHAR(20),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Sessions
CREATE TABLE sessions (
  id VARCHAR(64) PRIMARY KEY,
  agent_id INT REFERENCES agents(id),
  conversation_history JSONB,
  neo4j_context JSONB, -- cached Neo4j query results
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Outputs
CREATE TABLE outputs (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(64) REFERENCES sessions(id),
  markdown_content TEXT NOT NULL,
  metadata JSONB, -- execution time, token count, etc.
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 3.4 Claude Agent SDK Integration
- **Agent Definition** (per agent in DB or config file):
  ```yaml
  name: Data Lineage Analyzer
  skills:
    - name: data-lineage
      version: 1.1.0
      # Automatically linked via claude-agent-sdk
    - name: code-analysis
      version: 1.0.0
  mcps:
    - name: neo4j
      uri: neo4j://...
    - name: filesystem
      base_path: /data/codebase
  system_prompt: |
    You are a data lineage expert. Analyze the provided files and Neo4j data...
  ```

- **Execution Flow**:
  1. Backend loads agent config
  2. Instantiate `Agent` from claude-agent-sdk with:
     - System prompt
     - Skill list + MCP URIs
     - Max iterations (e.g., 10)
  3. Pass user input + context to agent.run()
  4. Agent iteratively queries MCP (Neo4j, filesystem), calls Claude
  5. Collect output, cache metadata
  6. Return final markdown to user

#### 3.5 Neo4j MCP Integration
- **MCP Tools** (available to agents):
  - `find_field_lineage(field_name, run_id)` - Query Neo4j for field usage
  - `neo4j_query(cypher_query, params)` - Generic Cypher execution
  - `get_snippet_location(snippet_key, run_id)` - Resolve file paths

- **Neo4j Schema** (assumed or user-provided):
  - Nodes: DatabaseEntity, Dbcall, Snippet, ExecutionFlow, Variable
  - Relationships: CONTAINS_DB_CALLS, CONTAINS_VARIABLE, READS, WRITES

#### 3.6 Filesystem MCP Integration
- **MCP Tools**:
  - `read_file(path)` - Read code file contents
  - `list_files(directory, filter)` - Scan directory for code files
  - `write_file(path, content)` - Save generated reports (if needed)

---

### 4. Key User Workflows

#### Workflow 1: Run Data Lineage Agent
1. User lands on `/` - sees "Data Lineage Analyzer" agent card
2. Clicks "Run" → modal opens with form:
   - **File Paths** (textarea or file upload)
   - **Target Fields** (text input, e.g., "CUSTOMER_ID, ORDER_ID")
   - **Trace Depth** (slider, default 3)
   - **Output Format** (checkbox: include diagram?)
3. Clicks "Analyze"
4. Agent executes (spinner shown, logs printed if debug mode)
5. Output rendered in split-pane:
   - Left: Markdown source
   - Right: Preview with tables, code blocks, diagram (if selected)
6. User can download `.md` or `.html`

#### Workflow 2: Follow-up Query in Chat
1. From output viewer, user clicks "Ask Follow-up Question" or chat icon
2. Navigates to `/chat/:sessionId`
3. Chat window shows:
   - System message: "Initial lineage analysis for CUSTOMER_ID complete"
   - Prior output summary (first 200 chars)
4. User types: "Which systems write to CUSTOMER_ID? Are there any risks?"
5. App maintains context:
   - Prior agent output
   - Conversation history
   - Neo4j cache (reuses prior query)
6. Claude responds with analysis + citations
7. Response shown in chat

#### Workflow 3: Admin Creates New Agent
1. Admin navigates to `/admin/agents`
2. Clicks "Create Agent" button
3. Form opens:
   - Agent name: "Custom Code Analyzer"
   - Description: "..."
   - System Prompt: [textarea with template variables]
   - Skills: [multi-select] → selects "code-analysis" + "data-lineage"
   - Input Parameters: [add fields] → "code_type", "file_extension_filter"
4. Clicks Save
5. Agent appears in the grid on `/`

---

### 5. Deployment & Setup

#### Development Environment
- **Prerequisites**:
  - Node.js 18+
  - PostgreSQL 13+ (or SQLite for local testing)
  - Neo4j 4.4+ (local or cloud instance)
  - Anthropic API key

- **Setup Steps**:
  1. Clone repo
  2. Install deps: `npm install`
  3. Create `.env`:
     ```
     ANTHROPIC_API_KEY=sk_...
     DATABASE_URL=postgres://localhost/aip
     NEO4J_URI=neo4j://localhost:7687
     NEO4J_USER=neo4j
     NEO4J_PASSWORD=...
     PORT=5000
     ```
  4. Run migrations: `npm run migrate`
  5. Seed agents (data-lineage + 1-2 others): `npm run seed`
  6. Start backend: `npm run server`
  7. Start frontend: `npm run dev` (React dev server on :3000)
  8. Open `http://localhost:3000`

#### Local Deployment (Docker)
- Dockerfile for Express app
- Docker Compose with PostgreSQL + Neo4j services
- One-command startup: `docker-compose up`

---

### 6. Data Lineage Agent - Detailed Spec

#### Input Parameters
| Parameter | Type | Required | Default | Example |
|-----------|------|----------|---------|---------|
| file_paths | string[] | Yes | - | ["/data/code/*.cs", "/data/sql/*.sql"] |
| target_fields | string | Yes | - | "CUSTOMER_ID, ORDER_DATE" |
| trace_depth | int | No | 3 | 2, 3, 5 |
| include_diagram | bool | No | false | true |
| tech_stack | string[] | No | ["csharp", "python", "plsql"] | ["csharp"] |

#### Processing Steps
1. **File Discovery**: Use Filesystem MCP to find all code files matching patterns
2. **Parsing & Initial Lineage** (via Claude):
   - Parse each file
   - Identify variable assignments, method calls, DB queries
   - Build intermediate lineage chain per file
3. **Neo4j Enrichment**: Query Neo4j for existing lineage data (if run_id provided)
4. **Cross-File Correlation**: Match field names, table references across files
5. **Report Generation**:
   - Markdown: tables, summaries, code snippets, lineage chains
   - Mermaid: visual flowchart (if requested)
6. **Output**: Return combined markdown + metadata

#### Output Example (abbreviated)
```markdown
# Data Lineage Analysis Report
## Executive Summary
- **Analysis Date**: 2025-05-14
- **Files Scanned**: 5 (C#: 2, Python: 1, PL/SQL: 2)
- **Fields Traced**: CUSTOMER_ID, ORDER_ID
- **Findings**: CUSTOMER_ID read by 3 processes, written by 1 daily batch

## Table Dependency Matrix
| Field | Write Source | Read By | Tech | Frequency |
|-------|--------------|---------|------|-----------|
| CUSTOMER_ID | ERP_Daily.sql | OrderProcessor.cs, DataSync.py | SQL, C#, Python | 1x/day, continuous |
| ORDER_ID | OrderProcessor.cs | Reporting.py | C#, Python | Real-time, hourly |

## Detailed Lineage: CUSTOMER_ID
### Origin
**File**: `ERP_Daily.sql` (Line 42)
\`\`\`sql
SELECT CUSTOMER_ID, CUSTOMER_NAME FROM master_customer_db
\`\`\`

### Transform (C#)
**File**: `OrderProcessor.cs` (Line 15-25)
\`\`\`csharp
public class OrderService {
  public void ProcessOrder(int customerId) {
    var customer = _db.Customers.Find(customerId);
    // ...
  }
}
\`\`\`

### Consumer (Python)
**File**: `DataSync.py` (Line 88)
\`\`\`python
df = pd.read_sql(
  "SELECT * FROM orders WHERE CUSTOMER_ID = ?", 
  conn, 
  params=(customer_id,)
)
\`\`\`

## Potential Issues
- ⚠️ CUSTOMER_ID written by one process daily; read continuously by others
- ✓ No orphaned fields found
- ℹ️ Recommend adding logging for ID transformations between systems
```

---

### 7. Non-Functional Requirements

| Aspect | Requirement |
|--------|-------------|
| **Performance** | Agent execution < 30s for typical 5-file analysis; chat response < 5s |
| **Scalability** | MVP handles 1-5 concurrent users; 10-100 agents |
| **Availability** | Local/dev-only; no SLA needed |
| **Security** | No auth for prototype; assume trusted environment |
| **Logging** | Console logs + file logs (debug mode) for agent execution trace |
| **Browser Support** | Chrome, Firefox, Safari (modern versions) |
| **Accessibility** | Basic WCAG A compliance (clean UI, semantic HTML) |

---

### 8. Success Criteria (MVP)

- [ ] User can select agent from landing page
- [ ] Agent executes, produces markdown output
- [ ] Output viewer displays MD source + preview
- [ ] User can download output as .md or .html
- [ ] Chat interface allows follow-up queries with context
- [ ] Admin can create/edit agents and skills
- [ ] Data Lineage Agent analyzes 3-5 code files and produces correct lineage report
- [ ] Data Lineage Agent optionally generates Mermaid diagram
- [ ] All data persisted to PostgreSQL (configs, conversations, outputs)
- [ ] No auth required; open-access in local dev mode

---

## Implementation Plan

### Phase 1: Backend Scaffolding (Days 1-2)
- Express.js project setup
- PostgreSQL schema + migrations
- Basic CRUD routes (agents, skills, sessions)
- Claude Agent SDK integration (basic instantiation)
- Environment config (.env support)

### Phase 2: Frontend Core (Days 3-4)
- React project setup (Vite or CRA)
- Agent selection landing page
- Agent input form (dynamic, based on config)
- Output viewer (MD + preview split-pane)
- Download functionality

### Phase 3: Chat Interface (Day 5)
- Chat window component
- Session persistence (store conversation history in DB)
- Follow-up query execution (with context reuse)
- Agent switching in chat

### Phase 4: Admin Dashboard (Day 5-6)
- Agent CRUD (list, create, edit, delete)
- Skill CRUD (list, edit)
- Neo4j connection settings UI

### Phase 5: Data Lineage Agent (Days 6-7)
- Implement agent logic using Claude + MCP
- Filesystem scanning + code parsing
- Markdown report generation
- Mermaid diagram generation
- Integration testing

### Phase 6: Polish & Deployment (Day 7-8)
- Error handling, validation
- E2E testing (core workflows)
- Docker setup
- Documentation (README, setup guide)

---

## Critical Files to Create

```
aip/
├── backend/
│   ├── src/
│   │   ├── app.ts                 # Express app setup
│   │   ├── routes/
│   │   │   ├── agents.ts          # Agent CRUD + execution
│   │   │   ├── conversations.ts   # Chat history
│   │   │   └── skills.ts          # Skill management
│   │   ├── models/
│   │   │   ├── Agent.ts
│   │   │   ├── Skill.ts
│   │   │   └── Session.ts
│   │   ├── services/
│   │   │   ├── AgentExecutor.ts   # Claude Agent instantiation & run
│   │   │   ├── MCPManager.ts      # Neo4j + Filesystem MCP handling
│   │   │   └── ConversationManager.ts
│   │   ├── db/
│   │   │   ├── migrations/
│   │   │   │   └── 001_init.sql
│   │   │   └── connection.ts
│   │   └── utils/
│   │       └── env.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.tsx           # Agent grid
│   │   │   ├── AgentRun.tsx       # Agent form + output viewer
│   │   │   ├── Chat.tsx           # Chat interface
│   │   │   └── Admin/
│   │   │       ├── Agents.tsx
│   │   │       ├── Skills.tsx
│   │   │       └── Settings.tsx
│   │   ├── components/
│   │   │   ├── AgentGrid.tsx
│   │   │   ├── OutputViewer.tsx
│   │   │   ├── ChatWindow.tsx
│   │   │   └── AdminTable.tsx
│   │   ├── services/
│   │   │   └── api.ts
│   │   ├── App.tsx
│   │   └── index.css
│   ├── package.json
│   ├── vite.config.ts
│   └── .env.example
│
├── agents/
│   ├── data-lineage.yaml          # Data Lineage Agent definition
│   └── README.md                  # Agent documentation
│
├── docker-compose.yml
├── Dockerfile
└── README.md
```

---

## Verification (Testing Approach)

1. **Manual Test: Run Data Lineage Agent**
   - Upload 3-5 sample code files (C#, Python, PL/SQL)
   - Request lineage for a common field (e.g., CUSTOMER_ID)
   - Verify output markdown includes:
     - Correct file names and line numbers
     - Accurate lineage chain (origin → transform → consumer)
     - Mermaid diagram (if selected)

2. **Manual Test: Chat Follow-up**
   - Execute agent, get initial output
   - Send follow-up question: "What systems depend on CUSTOMER_ID?"
   - Verify Claude incorporates prior context and produces coherent response

3. **Manual Test: Admin Workflow**
   - Create new agent in admin panel
   - Verify it appears in landing page
   - Run the new agent, confirm execution works

4. **Integration Test: Database Persistence**
   - Create agent, restart backend
   - Verify agent config persists
   - Verify conversation history persists

---

## Next Steps After Plan Approval

1. Initialize backend + frontend projects with TypeScript, ESLint, Prettier
2. Set up PostgreSQL schema and seeders
3. Build express routes and React pages in parallel
4. Integrate Claude Agent SDK with Neo4j + Filesystem MCPs
5. Implement Data Lineage Agent skills and logic
6. Full E2E testing and deployment to Docker
