/**
 * Real-time Agent Execution Progress Display
 */
import { useEffect, useRef } from 'react';
import type { AgentRunResponse } from '@/types';
import { useAgentProgress } from '@/hooks/useAgentProgress';
import { Spinner } from './Spinner';

interface AgentProgressDisplayProps {
  sessionId: string | null;
  onComplete?: (result: AgentRunResponse) => void;
  /** Fired once when SSE reports failure or connection drops (so parent can clear loading state). */
  onError?: (message: string) => void;
}

export function AgentProgressDisplay({
  sessionId,
  onComplete,
  onError,
}: AgentProgressDisplayProps) {
  const { progress, connect, disconnect, reset } = useAgentProgress();
  const completionSentRef = useRef(false);

  useEffect(() => {
    if (sessionId) {
      completionSentRef.current = false;
      reset();
      connect(sessionId);
    } else {
      disconnect();
    }

    return () => disconnect();
  }, [sessionId, connect, disconnect, reset]);

  const errorSentRef = useRef(false);

  useEffect(() => {
    if (progress.status === 'error' && onError && progress.error) {
      if (errorSentRef.current) return;
      errorSentRef.current = true;
      onError(progress.error);
    }
    if (progress.status !== 'error') {
      errorSentRef.current = false;
    }
  }, [progress.status, progress.error, onError]);

  useEffect(() => {
    if (progress.status === 'completed' && onComplete && progress.partialText && sessionId) {
      if (completionSentRef.current) return;
      completionSentRef.current = true;
      const completed = [...progress.events].reverse().find((e) => e.type === 'completed') as
        | {
            totalTokens?: number;
            totalToolCalls?: number;
            executionMs?: number;
            iterations?: number;
          }
        | undefined;

      const mermaidMatch = progress.partialText.match(/```mermaid\n([\s\S]*?)```/);
      const mermaid = mermaidMatch ? mermaidMatch[1].trim() : undefined;

      onComplete({
        sessionId,
        markdown: progress.partialText,
        mermaid,
        metadata: {
          executionMs: completed?.executionMs ?? progress.elapsedMs ?? 0,
          tokensUsed: completed?.totalTokens ?? progress.tokensTotal,
          toolCalls: completed?.totalToolCalls ?? progress.toolCallsTotal,
          iterations: completed?.iterations ?? progress.currentIteration,
        },
      });
    }
  }, [progress.status, progress.partialText, progress.events, progress.elapsedMs, progress.tokensTotal, progress.toolCallsTotal, progress.currentIteration, onComplete, sessionId]);

  if (!sessionId || progress.status === 'idle') {
    return null;
  }

  if (progress.status === 'error') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex items-start gap-3">
          <div className="text-red-600">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="font-medium text-red-900">Execution Error</h4>
            <p className="mt-1 text-sm text-red-700">{progress.error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (progress.status === 'completed') {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex items-start gap-3">
          <div className="text-green-600">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="font-medium text-green-900">Analysis Complete</h4>
            <p className="mt-1 text-sm text-green-700">
              Completed in {Math.round(progress.elapsedMs / 1000)}s · {progress.currentIteration}{' '}
              iterations · {progress.toolCallsTotal} tools · {progress.tokensTotal} tokens
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Running state
  const percentComplete = progress.maxIterations > 0
    ? Math.min(100, Math.round((progress.currentIteration / progress.maxIterations) * 100))
    : 0;

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-start gap-3">
        <Spinner size="sm" />
        <div className="flex-1 space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-blue-900">
                {progress.agentName || 'Agent'} Running...
              </h4>
              <span className="text-sm text-blue-700">
                {Math.round(progress.elapsedMs / 1000)}s
              </span>
            </div>
            <p className="mt-1 text-sm text-blue-700">
              Iteration {progress.currentIteration} of {progress.maxIterations}
            </p>
          </div>

          {/* Progress bar */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${percentComplete}%` }}
            />
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-blue-600">
            <span>🔧 {progress.toolCallsTotal} tool calls</span>
            <span>🪙 {progress.tokensTotal} tokens</span>
          </div>

          {/* Recent events */}
          <div className="max-h-32 space-y-1 overflow-y-auto text-xs">
            {progress.events.length > 0 ? (
              progress.events.slice(-5).map((event, idx) => (
                <div key={idx} className="text-blue-600">
                  {formatEvent(event)}
                </div>
              ))
            ) : (
              <div className="text-blue-500">
                🔄 Agent is analyzing the codebase using built-in tools (Read, Glob, Grep)...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatEvent(event: any): string {
  switch (event.type) {
    case 'started':
      return `▶️ Started analysis...`;
    case 'iteration_start':
      return `🔄 Starting iteration ${event.iteration}...`;
    case 'tool_call':
      return `🔧 Calling tool: ${event.toolName}`;
    case 'tool_result':
      return event.success
        ? `✅ ${event.toolName} completed (${event.resultSize}B)`
        : `❌ ${event.toolName} failed`;
    case 'iteration_complete':
      const toolsText = event.toolCalls ? `${event.toolCalls} tools, ` : '';
      return `✅ Iteration ${event.iteration} complete (${toolsText}${event.inputTokens + event.outputTokens} tokens)`;
    case 'text_chunk':
      return `📝 Generating report...`;
    default:
      return `${event.type}`;
  }
}
