/**
 * Agent execution via @anthropic-ai/claude-agent-sdk (Claude Code subprocess).
 * Opt-in with AGENT_EXECUTOR_BACKEND=agent-sdk — see README.
 *
 * Streaming: emits progress events via progressEmitter for SSE (tool_call / tool_result /
 * iteration_complete / text_chunk / completed). Session `started` is emitted by the HTTP
 * job wrapper; this module calls progressEmitter.complete after `completed`.
 */
import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import { env } from '../../config/env';
import { createLogger } from '../../utils/logger';
import type { ToolHandler } from '../MCPManager';
import { finalizeRun } from './finalizeRun';
import { buildInitialUserMessage } from './runPrompt';
import type { IterationTrace, RunRequest, RunResult } from './types';
import { progressEmitter } from './progressEmitter';

const log = createLogger('executor-agent-sdk');

const MCP_SERVER_KEY = 'aip';

const MAX_TOOL_RESULT_CHARS = 6_000;

export interface AgentSdkRunOptions {
  /** When true, raw-repo mode should avoid Bash unless AGENT_SDK_ALLOW_BASH is set. */
  useNeo4j: boolean;
}

function clampToolResult(payload: unknown): string {
  let s: string;
  try {
    s = typeof payload === 'string' ? payload : JSON.stringify(payload);
  } catch {
    s = String(payload);
  }
  if (s.length > MAX_TOOL_RESULT_CHARS) {
    return (
      s.slice(0, MAX_TOOL_RESULT_CHARS) +
      `\n\n... [truncated ${s.length - MAX_TOOL_RESULT_CHARS} chars]`
    );
  }
  return s;
}

function mcpToolAppendix(handlers: ToolHandler[]): string {
  if (handlers.length === 0) return '';
  const lines = handlers.map(
    (h) => `- \`${h.def.name}\` → \`mcp__${MCP_SERVER_KEY}__${h.def.name}\``
  );
  return [
    '',
    '## MCP tool identifiers (required)',
    'When you call an application MCP tool, use the **exact** MCP-qualified name on the left below:',
    '',
    ...lines,
    '',
    'Do not invent tool names. If a tool is not listed, you cannot call it.',
  ].join('\n');
}

function builtinToolAppendix(allowBash: boolean): string {
  const lines = [
    '',
    '## Built-in tools (Claude Agent SDK)',
    'The working directory (`cwd`) is the repository root for this run.',
    '- **Glob** — find file paths by pattern (e.g. `**/*.sql`, `**/CSharp/**/*.cs`).',
    '- **Grep** — search file contents with regex (identifiers, table/column names, SQL fragments). Prefer this over reading huge files whole.',
    '- **Read** — read file contents; use for small slices or files after Grep narrows candidates.',
  ];
  if (allowBash) {
    lines.push(
      '- **Bash** — optional shell (e.g. `git`). Use only when Glob/Grep/Read is insufficient; keep commands minimal and safe.'
    );
  }
  return lines.join('\n');
}

function buildAllowedTools(
  hasMcpHandlers: boolean,
  runCtx: AgentSdkRunOptions
): string[] {
  const builtins: string[] = ['Read', 'Glob', 'Grep'];
  const allowBash =
    env.agentSdkAllowBashWithoutNeo4j && !runCtx.useNeo4j;
  if (allowBash) builtins.push('Bash');
  if (hasMcpHandlers) {
    return [...builtins, `mcp__${MCP_SERVER_KEY}__*`];
  }
  return builtins;
}

function buildMcpServer(
  handlers: ToolHandler[],
  ctx: { sessionId?: string; fsSandboxRoot?: string },
  stats: { toolCalls: number }
) {
  const zLoose = z.object({}).catchall(z.unknown());
  const wrapped = handlers.map((h) =>
    tool(
      h.def.name,
      h.def.description,
      zLoose as unknown as Parameters<typeof tool>[2],
      async (args: Record<string, unknown>) => {
        const toolStart = Date.now();
        stats.toolCalls += 1;
        const sid = ctx.sessionId;
        if (sid) {
          progressEmitter.emit(sid, {
            type: 'tool_call',
            sessionId: sid,
            timestamp: Date.now(),
            iteration: stats.toolCalls,
            toolName: h.def.name,
            argsPreview: JSON.stringify(args).slice(0, 100),
          });
        }

        const res = await h.run(args ?? {}, ctx);
        const durationMs = Date.now() - toolStart;

        if (res.ok) {
          const text = clampToolResult(res.data);
          if (sid) {
            progressEmitter.emit(sid, {
              type: 'tool_result',
              sessionId: sid,
              timestamp: Date.now(),
              iteration: stats.toolCalls,
              toolName: h.def.name,
              success: true,
              resultSize: text.length,
              durationMs,
            });
          }
          return { content: [{ type: 'text' as const, text }] };
        }

        if (sid) {
          progressEmitter.emit(sid, {
            type: 'tool_result',
            sessionId: sid,
            timestamp: Date.now(),
            iteration: stats.toolCalls,
            toolName: h.def.name,
            success: false,
            resultSize: 0,
            durationMs,
          });
        }
        return {
          content: [{ type: 'text' as const, text: String(res.error) }],
          isError: true as const,
        };
      }
    )
  );
  return createSdkMcpServer({
    name: MCP_SERVER_KEY,
    version: '1.0.0',
    tools: wrapped,
  });
}

export async function runWithAgentSdk(
  req: RunRequest,
  handlers: ToolHandler[],
  runCtx: AgentSdkRunOptions
): Promise<RunResult> {
  const t0 = Date.now();
  const sessionId = req.sessionId;

  // Extract neo4j_run_id from inputs for auto-injection into Neo4j tools
  const neo4jRunId = typeof req.inputs.neo4j_run_id === 'number'
    ? req.inputs.neo4j_run_id
    : undefined;

  const toolCtx = {
    sessionId: req.sessionId,
    fsSandboxRoot: req.fsSandboxRoot,
    neo4jRunId,
  };
  const toolStats = { toolCalls: 0 };
  const hasMcp = handlers.length > 0;
  const mcpServer = hasMcp ? buildMcpServer(handlers, toolCtx, toolStats) : null;
  const allowBash =
    env.agentSdkAllowBashWithoutNeo4j && !runCtx.useNeo4j;
  const allowedTools = buildAllowedTools(hasMcp, runCtx);
  const systemPrompt =
    req.agent.system_prompt +
    builtinToolAppendix(allowBash) +
    mcpToolAppendix(handlers);
  const prompt = buildInitialUserMessage(req);

  log.info(
    `agent-sdk start agent="${req.agent.name}" session=${req.sessionId} mcpTools=${handlers.map((h) => h.def.name).join(',') || 'none'} allowedTools=${allowedTools.join(',')} useNeo4j=${runCtx.useNeo4j} maxTurns=${env.maxAgentIterations}`
  );

  let finalText = '';
  let lastStop: string | null = null;
  let numTurns = 0;
  let inputTok = 0;
  let outputTok = 0;
  let lastToolCount = 0;
  let iterationCounter = 0; // Track iterations locally since Agent SDK reports total at end

  // Emit initial iteration start
  iterationCounter = 1;
  progressEmitter.emit(sessionId, {
    type: 'iteration_start',
    sessionId,
    timestamp: Date.now(),
    iteration: iterationCounter,
  });

  const stream = query({
    prompt,
    options: {
      systemPrompt: systemPrompt,
      model: env.anthropicModel,
      cwd: req.fsSandboxRoot ?? env.fsSandboxRoot,
      ...(mcpServer
        ? { mcpServers: { [MCP_SERVER_KEY]: mcpServer } }
        : {}),
      allowedTools,
      maxTurns: env.maxAgentIterations,
      settingSources: [],
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      persistSession: false,
      env: {
        ...process.env,
        ...(env.anthropicApiKey ? { ANTHROPIC_API_KEY: env.anthropicApiKey } : {}),
        ...(env.anthropicAuthToken
          ? { ANTHROPIC_AUTH_TOKEN: env.anthropicAuthToken }
          : {}),
        ...(env.anthropicBaseUrl
          ? { ANTHROPIC_BASE_URL: env.anthropicBaseUrl }
          : {}),
      },
    },
  });

  for await (const msg of stream) {
    // Log stream messages for debugging
    const msgType = msg.type;
    log.info(`agent-sdk stream event: ${msgType}`);

    if (msg.type === 'result') {
      if (msg.subtype === 'success') {
        finalText = msg.result ?? '';
        lastStop = msg.stop_reason ?? 'end_turn';
        numTurns = msg.num_turns ?? 0;
        const u = msg.usage;
        if (u) {
          inputTok += u.input_tokens ?? 0;
          outputTok += u.output_tokens ?? 0;
        }

        const elapsedMs = Date.now() - t0;
        const newToolCalls = toolStats.toolCalls - lastToolCount;
        lastToolCount = toolStats.toolCalls;

        log.info(`agent-sdk iteration ${iterationCounter} complete: stop=${lastStop}, tools=${newToolCalls}, chars=${finalText.length}, tokens=${inputTok + outputTok}`);

        progressEmitter.emit(sessionId, {
          type: 'iteration_complete',
          sessionId,
          timestamp: Date.now(),
          iteration: iterationCounter,
          stopReason: lastStop,
          textChars: finalText.length,
          toolCalls: newToolCalls,
          inputTokens: u?.input_tokens ?? 0,
          outputTokens: u?.output_tokens ?? 0,
          elapsedMs,
        });

        // If more iterations expected, emit start of next iteration
        if (lastStop === 'tool_use' && iterationCounter < env.maxAgentIterations) {
          iterationCounter++;
          progressEmitter.emit(sessionId, {
            type: 'iteration_start',
            sessionId,
            timestamp: Date.now(),
            iteration: iterationCounter,
          });
        }

        if (finalText && lastStop !== 'tool_use') {
          progressEmitter.emit(sessionId, {
            type: 'text_chunk',
            sessionId,
            timestamp: Date.now(),
            text: finalText,
            isFinal: true,
          });
        }
      } else {
        const errMsg =
          'errors' in msg && Array.isArray(msg.errors)
            ? msg.errors.join('; ')
            : 'subtype' in msg
              ? String((msg as { subtype: string }).subtype)
              : 'unknown_error';

        progressEmitter.emit(sessionId, {
          type: 'error',
          sessionId,
          timestamp: Date.now(),
          error: errMsg,
          iteration: numTurns,
        });

        throw new Error(`Claude Agent SDK run failed: ${errMsg}`);
      }
    }
  }

  // Create a trace entry with token breakdown for accurate cost calculation
  const trace: IterationTrace[] = [
    {
      iter: 0,
      stopReason: lastStop ?? 'end_turn',
      textChars: finalText.length,
      textPreview: '',
      toolCalls: [],
      inputTokens: inputTok,
      outputTokens: outputTok,
      elapsedMs: Date.now() - t0,
    },
  ];
  const totalTokens = inputTok + outputTok;

  const result = await finalizeRun({
    finalText: finalText || '_No text result from Agent SDK._',
    trace,
    totalTokens,
    totalToolCalls: toolStats.toolCalls,
    stopReason: lastStop ?? 'end_turn',
    iterations: numTurns || iterationCounter || 1,
    t0,
    executorBackend: 'agent-sdk',
  });

  progressEmitter.emit(sessionId, {
    type: 'completed',
    sessionId,
    timestamp: Date.now(),
    markdown: result.markdown,
    mermaid: result.mermaid,
    iterations: result.metadata.iterations,
    totalTokens: result.metadata.tokensUsed,
    totalToolCalls: result.metadata.toolCalls,
    executionMs: result.metadata.executionMs,
  });

  setTimeout(() => {
    progressEmitter.complete(sessionId);
  }, 1000);

  return result;
}
