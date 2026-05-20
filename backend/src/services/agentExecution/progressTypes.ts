/**
 * Types for streaming agent execution progress to frontend
 */

export type ProgressEventType =
  | 'started'
  | 'iteration_start'
  | 'tool_call'
  | 'tool_result'
  | 'iteration_complete'
  | 'text_chunk'
  | 'completed'
  | 'error';

export interface BaseProgressEvent {
  type: ProgressEventType;
  sessionId: string;
  timestamp: number;
}

export interface StartedEvent extends BaseProgressEvent {
  type: 'started';
  agentName: string;
  maxIterations: number;
}

export interface IterationStartEvent extends BaseProgressEvent {
  type: 'iteration_start';
  iteration: number;
  elapsedMs: number;
}

export interface ToolCallEvent extends BaseProgressEvent {
  type: 'tool_call';
  iteration: number;
  toolName: string;
  argsPreview: string;
}

export interface ToolResultEvent extends BaseProgressEvent {
  type: 'tool_result';
  iteration: number;
  toolName: string;
  success: boolean;
  resultSize: number;
  durationMs: number;
}

export interface IterationCompleteEvent extends BaseProgressEvent {
  type: 'iteration_complete';
  iteration: number;
  stopReason: string | null;
  textChars: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  elapsedMs: number;
}

export interface TextChunkEvent extends BaseProgressEvent {
  type: 'text_chunk';
  text: string;
  isFinal: boolean;
}

export interface CompletedEvent extends BaseProgressEvent {
  type: 'completed';
  markdown: string;
  mermaid: string | null;
  iterations: number;
  totalTokens: number;
  totalToolCalls: number;
  executionMs: number;
}

export interface ErrorEvent extends BaseProgressEvent {
  type: 'error';
  error: string;
  iteration?: number;
}

export type ProgressEvent =
  | StartedEvent
  | IterationStartEvent
  | ToolCallEvent
  | ToolResultEvent
  | IterationCompleteEvent
  | TextChunkEvent
  | CompletedEvent
  | ErrorEvent;
