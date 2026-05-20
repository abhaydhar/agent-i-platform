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
  /** When true, the run continues in the background; subscribe to SSE for progress and final markdown. */
  pending?: boolean;
  markdown?: string;
  mermaid?: string;
  metadata?: {
    executionMs: number;
    tokensUsed?: number;
    toolCalls?: number;
    iterations?: number;
    filesAnalyzed?: number;
    model?: string;
    mocked?: boolean;
    stopReason?: string;
    executorBackend?: string;
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

export interface TokenStats {
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  totalExecutionMs: number;
  runCount: number;
  byModel: Record<
    string,
    {
      tokens: number;
      inputTokens: number;
      outputTokens: number;
      cost: number;
      runCount: number;
    }
  >;
}
