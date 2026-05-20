import type { AgentRow } from '../../models/types';

export interface RunRequest {
  agent: AgentRow;
  sessionId: string;
  inputs: Record<string, unknown>;
  priorMarkdown?: string;
  userMessage?: string;
  fsSandboxRoot?: string;
}

export interface ToolCallTrace {
  name: string;
  argsPreview: string;
  ok: boolean;
  resultPreview: string;
  resultBytes: number;
  ms: number;
}

export interface IterationTrace {
  iter: number;
  stopReason: string | null;
  textChars: number;
  textPreview: string;
  toolCalls: ToolCallTrace[];
  inputTokens: number;
  outputTokens: number;
  elapsedMs: number;
}

export interface RunResult {
  markdown: string;
  mermaid: string | null;
  metadata: {
    executionMs: number;
    tokensUsed: number;
    toolCalls: number;
    iterations: number;
    stopReason: string;
    model: string;
    mocked: boolean;
    trace?: IterationTrace[];
    executorBackend?: 'messages' | 'agent-sdk';
  };
}
