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
  default?: string | number | boolean | string[];
  placeholder?: string;
  description?: string;
  options?: Array<{ label: string; value: string }>;
  min?: number;
  max?: number;
  step?: number;
}

export interface Agent {
  id: number | string;
  name: string;
  description: string;
  icon?: string;
  capability?: string;
  skills: string[];
  system_prompt?: string;
  input_params: InputParam[];
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AgentRunRequest {
  agentId: Agent['id'];
  inputs: Record<string, unknown>;
}

export interface AgentRunResponse {
  sessionId: string;
  markdown: string;
  mermaid?: string;
  metadata: {
    executionMs: number;
    tokensUsed?: number;
    filesAnalyzed?: number;
    model?: string;
  };
}

export type OutputViewMode = 'source' | 'preview' | 'split';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export interface SessionDetails {
  id: string;
  agentId: number | string | null;
  agentName: string | null;
  inputs: Record<string, unknown> | null;
  history: ChatMessage[];
  lastOutput: {
    markdown: string;
    mermaid: string | null;
    metadata: Record<string, unknown>;
  } | null;
}

export interface SendMessageResponse {
  session: SessionDetails;
  assistant: ChatMessage;
  run: AgentRunResponse;
}

export interface Neo4jSettings {
  configured: boolean;
  uri?: string;
  user?: string;
}
