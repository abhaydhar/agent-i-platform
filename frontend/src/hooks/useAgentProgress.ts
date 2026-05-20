import { useCallback, useEffect, useState, useRef } from 'react';

import { getAgentProgressStreamUrl } from '@/utils/agentStreamUrl';

export interface ProgressEvent {
  type:
    | 'connected'
    | 'started'
    | 'iteration_start'
    | 'tool_call'
    | 'tool_result'
    | 'iteration_complete'
    | 'text_chunk'
    | 'completed'
    | 'error';
  sessionId: string;
  timestamp: number;
  [key: string]: any;
}

export interface AgentProgress {
  status: 'idle' | 'connecting' | 'running' | 'completed' | 'error';
  agentName?: string;
  currentIteration: number;
  maxIterations: number;
  toolCallsTotal: number;
  tokensTotal: number;
  elapsedMs: number;
  partialText?: string;
  error?: string;
  events: ProgressEvent[];
}

interface UseAgentProgressResult {
  progress: AgentProgress;
  connect: (sessionId: string) => void;
  disconnect: () => void;
  reset: () => void;
}

export function useAgentProgress(): UseAgentProgressResult {
  const [progress, setProgress] = useState<AgentProgress>({
    status: 'idle',
    currentIteration: 0,
    maxIterations: 0,
    toolCallsTotal: 0,
    tokensTotal: 0,
    elapsedMs: 0,
    events: [],
  });

  const eventSourceRef = useRef<EventSource | null>(null);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    disconnect();
    setProgress({
      status: 'idle',
      currentIteration: 0,
      maxIterations: 0,
      toolCallsTotal: 0,
      tokensTotal: 0,
      elapsedMs: 0,
      events: [],
    });
  }, [disconnect]);

  const connect = useCallback(
    (sessionId: string) => {
      disconnect(); // Close any existing connection

      setProgress((prev) => ({
        ...prev,
        status: 'connecting',
        events: [],
      }));

      const eventSource = new EventSource(getAgentProgressStreamUrl(sessionId));
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('SSE connection established');
        setProgress((prev) => ({ ...prev, status: 'running' }));
      };

      eventSource.onmessage = (event) => {
        try {
          const data: ProgressEvent = JSON.parse(event.data);

          // Ignore keepalive messages
          if (data.type === 'connected') {
            return;
          }

          setProgress((prev) => {
            const newProgress = { ...prev };
            newProgress.events = [...prev.events, data];

            switch (data.type) {
              case 'started':
                newProgress.agentName = (data as any).agentName;
                newProgress.maxIterations = (data as any).maxIterations;
                newProgress.status = 'running';
                break;

              case 'iteration_start':
                newProgress.currentIteration = (data as any).iteration;
                newProgress.elapsedMs = (data as any).elapsedMs;
                break;

              case 'tool_call':
                newProgress.toolCallsTotal += 1;
                break;

              case 'iteration_complete':
                const iterData = data as any;
                newProgress.currentIteration = iterData.iteration || prev.currentIteration;
                newProgress.tokensTotal += iterData.inputTokens + iterData.outputTokens;
                newProgress.toolCallsTotal += iterData.toolCalls || 0;
                newProgress.elapsedMs = iterData.elapsedMs;
                break;

              case 'text_chunk':
                newProgress.partialText = (data as any).text;
                break;

              case 'completed':
                newProgress.status = 'completed';
                newProgress.partialText = (data as any).markdown;
                break;

              case 'error':
                newProgress.status = 'error';
                newProgress.error = (data as any).error;
                break;
            }

            return newProgress;
          });
        } catch (err) {
          console.error('Failed to parse SSE message:', err);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        setProgress((prev) => {
          // Don't treat SSE closure as error if agent already completed/errored
          if (prev.status === 'completed' || prev.status === 'error') {
            disconnect();
            return prev; // Keep existing status
          }
          // Only set error if agent was still running
          return {
            ...prev,
            status: 'error',
            error: 'Connection lost',
          };
        });
        disconnect();
      };
    },
    [disconnect]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    progress,
    connect,
    disconnect,
    reset,
  };
}
