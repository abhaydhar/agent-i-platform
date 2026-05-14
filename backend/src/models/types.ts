export type InputParamType =
  | 'string'
  | 'text'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'paths';

export interface InputParam {
  name: string;
  label?: string;
  type: InputParamType;
  required?: boolean;
  default?: unknown;
  placeholder?: string;
  description?: string;
  options?: Array<{ label: string; value: string }>;
  min?: number;
  max?: number;
  step?: number;
}

export interface AgentRow {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  capability: string | null;
  system_prompt: string;
  skills: string[];
  input_params: InputParam[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SkillRow {
  id: number;
  name: string;
  description: string | null;
  mcp_integrations: string[];
  skill_definition: string | null;
  version: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  id: string;
  agent_id: number | null;
  conversation_history: ChatMessage[];
  neo4j_context: Record<string, unknown>;
  inputs: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface OutputRow {
  id: number;
  session_id: string;
  markdown_content: string;
  mermaid_content: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}
