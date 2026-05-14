CREATE TABLE IF NOT EXISTS agents (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  icon VARCHAR(64),
  capability VARCHAR(255),
  system_prompt TEXT NOT NULL,
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  input_params JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skills (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  mcp_integrations JSONB NOT NULL DEFAULT '[]'::jsonb,
  skill_definition TEXT,
  version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(64) PRIMARY KEY,
  agent_id INT REFERENCES agents(id) ON DELETE SET NULL,
  conversation_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  neo4j_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  inputs JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_agent_id ON sessions(agent_id);

CREATE TABLE IF NOT EXISTS outputs (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(64) REFERENCES sessions(id) ON DELETE CASCADE,
  markdown_content TEXT NOT NULL,
  mermaid_content TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outputs_session_id ON outputs(session_id);

CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(64) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
