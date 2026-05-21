import Anthropic from '@anthropic-ai/sdk';
import { claudeAuthMode, env } from '../config/env';
import { runWithAgentSdk } from './agentExecution/agentSdkRun';
import { finalizeRun } from './agentExecution/finalizeRun';
import { buildInitialUserMessage } from './agentExecution/runPrompt';
import type { IterationTrace, RunRequest, RunResult } from './agentExecution/types';
export type {
  RunRequest,
  RunResult,
  IterationTrace,
  ToolCallTrace,
} from './agentExecution/types';
import { MCPManager, type ToolHandler } from './MCPManager';
import { buildMockRun } from './mockAgent';
import { createLogger } from '../utils/logger';
import { computeRunFsRoot } from '../utils/runFsRoot';

const log = createLogger('executor');

function buildAnthropicClient(): Anthropic {
  const opts: ConstructorParameters<typeof Anthropic>[0] = {};
  if (env.anthropicAuthToken) {
    opts.authToken = env.anthropicAuthToken;
    opts.apiKey = null;
  } else if (env.anthropicApiKey) {
    opts.apiKey = env.anthropicApiKey;
    opts.authToken = null;
  }
  if (env.anthropicBaseUrl) {
    opts.baseURL = env.anthropicBaseUrl;
  }
  return new Anthropic(opts);
}

const MAX_TOOL_RESULT_CHARS = 3_000;
const TRACE_PREVIEW_CHARS = 240;

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

function preview(s: string, n = TRACE_PREVIEW_CHARS): string {
  const cleaned = s.replace(/\s+/g, ' ').trim();
  return cleaned.length > n ? cleaned.slice(0, n) + '…' : cleaned;
}

function summarizeArgs(args: unknown): string {
  if (args === null || args === undefined) return '{}';
  try {
    const j = JSON.stringify(args);
    return preview(j, 200);
  } catch {
    return String(args);
  }
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: AnthropicContent[];
}

type AnthropicContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | {
      type: 'tool_result';
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    };

interface AnthropicBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

async function runWithMessagesApi(
  req: RunRequest,
  tools: ToolHandler[]
): Promise<RunResult> {
  const t0 = Date.now();
  const client = buildAnthropicClient();
  const trace: IterationTrace[] = [];
  let totalTokens = 0;
  let totalToolCalls = 0;
  let lastStopReason = '';

  const messages: AnthropicMessage[] = [
    {
      role: 'user',
      content: [{ type: 'text', text: buildInitialUserMessage(req) }],
    },
  ];

  const toolDefs = tools.map((t) => t.def);
  log.info(
    `start agent="${req.agent.name}" session=${req.sessionId} skills=[${req.agent.skills.join(',')}] tools=[${toolDefs.map((t) => t.name).join(',') || 'none'}] maxIter=${env.maxAgentIterations} backend=messages`
  );

  for (let iter = 0; iter < env.maxAgentIterations; iter++) {
    const iterStart = Date.now();
    let response: Awaited<ReturnType<typeof client.messages.create>>;
    try {
      response = await client.messages.create({
        model: env.anthropicModel,
        max_tokens: env.maxAgentTokensPerCall,
        system: req.agent.system_prompt,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        messages: messages as unknown as Anthropic.MessageParam[],
      });
    } catch (err) {
      log.error(`iter ${iter + 1} claude error`, err);
      throw err;
    }

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    totalTokens += inputTokens + outputTokens;
    lastStopReason = response.stop_reason ?? '';

    const blocks = response.content as unknown as AnthropicBlock[];
    const assistantContent: AnthropicContent[] = blocks.map((b) => {
      if (b.type === 'text') {
        return { type: 'text', text: b.text ?? '' };
      }
      if (b.type === 'tool_use') {
        return {
          type: 'tool_use',
          id: b.id ?? '',
          name: b.name ?? '',
          input: b.input ?? {},
        };
      }
      return { type: 'text', text: '' };
    });

    const iterText = assistantContent
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map((c) => c.text)
      .join('\n\n')
      .trim();

    messages.push({ role: 'assistant', content: assistantContent });

    const iterTrace: IterationTrace = {
      iter,
      stopReason: response.stop_reason ?? null,
      textChars: iterText.length,
      textPreview: preview(iterText),
      toolCalls: [],
      inputTokens,
      outputTokens,
      elapsedMs: 0,
    };

    log.info(
      `iter ${iter + 1}/${env.maxAgentIterations} stop=${response.stop_reason} text=${iterText.length}ch in=${inputTokens} out=${outputTokens}`
    );

    if (response.stop_reason !== 'tool_use') {
      iterTrace.elapsedMs = Date.now() - iterStart;
      trace.push(iterTrace);
      return finalizeRun({
        finalText: iterText,
        trace,
        totalTokens,
        totalToolCalls,
        stopReason: lastStopReason,
        iterations: iter + 1,
        t0,
        executorBackend: 'messages',
      });
    }

    const toolUseBlocks = assistantContent.filter((b) => b.type === 'tool_use');
    totalToolCalls += toolUseBlocks.length;

    log.info(`  executing ${toolUseBlocks.length} tools in parallel...`);

    const toolPromises = toolUseBlocks.map(async (block) => {
      const tcStart = Date.now();
      const argsPreview = summarizeArgs(block.input);
      log.info(`  tool_use → ${block.name} args=${argsPreview}`);

      // Extract neo4j_run_id from inputs for auto-injection into Neo4j tools
      const neo4jRunId = typeof req.inputs.neo4j_run_id === 'number'
        ? req.inputs.neo4j_run_id
        : undefined;

      const res = await MCPManager.runTool(
        block.name,
        (block.input as Record<string, unknown>) ?? {},
        {
          sessionId: req.sessionId,
          fsSandboxRoot: req.fsSandboxRoot,
          neo4jRunId
        }
      );

      const tcMs = Date.now() - tcStart;
      let resultStr: string;
      let resultBytes: number;
      let toolResult: AnthropicContent;

      if (res.ok) {
        resultStr = clampToolResult(res.data);
        resultBytes = resultStr.length;
        log.info(`    tool ok ${block.name} ${tcMs}ms ${resultBytes}B`);
        toolResult = {
          type: 'tool_result',
          tool_use_id: block.id,
          content: resultStr,
        };
      } else {
        resultStr = `Error: ${res.error}`;
        resultBytes = resultStr.length;
        log.warn(`    tool FAIL ${block.name} ${tcMs}ms — ${res.error}`);
        toolResult = {
          type: 'tool_result',
          tool_use_id: block.id,
          content: resultStr,
          is_error: true,
        };
      }

      return {
        toolResult,
        trace: {
          name: block.name,
          argsPreview,
          ok: res.ok,
          resultPreview: preview(resultStr),
          resultBytes,
          ms: tcMs,
        },
      };
    });

    const toolExecutions = await Promise.all(toolPromises);
    const toolResults: AnthropicContent[] = toolExecutions.map((e) => e.toolResult);
    toolExecutions.forEach((e) => iterTrace.toolCalls.push(e.trace));

    iterTrace.elapsedMs = Date.now() - iterStart;
    trace.push(iterTrace);
    messages.push({ role: 'user', content: toolResults });
  }

  log.warn(
    `max iterations (${env.maxAgentIterations}) reached — forcing a conclusion turn without tools`
  );
  messages.push({
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'You have reached the maximum number of tool-use rounds. Stop calling tools. Using ONLY the information you have already gathered, produce the final markdown report now. If you genuinely have insufficient information, say so plainly and list what you tried.',
      },
    ],
  });

  let forceConcludeText = '';
  try {
    const final = await client.messages.create({
      model: env.anthropicModel,
      max_tokens: env.maxAgentTokensPerCall,
      system: req.agent.system_prompt,
      messages: messages as unknown as Anthropic.MessageParam[],
    });
    const inputTokens = final.usage?.input_tokens ?? 0;
    const outputTokens = final.usage?.output_tokens ?? 0;
    totalTokens += inputTokens + outputTokens;
    lastStopReason = final.stop_reason ?? lastStopReason;
    const finalBlocks = final.content as unknown as AnthropicBlock[];
    const finalText = finalBlocks
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('\n\n')
      .trim();
    forceConcludeText = finalText;
    trace.push({
      iter: env.maxAgentIterations,
      stopReason: final.stop_reason ?? null,
      textChars: finalText.length,
      textPreview: preview(finalText),
      toolCalls: [],
      inputTokens,
      outputTokens,
      elapsedMs: 0,
    });
    log.info(
      `force-conclude stop=${final.stop_reason} text=${finalText.length}ch`
    );
  } catch (err) {
    log.error('force-conclude turn failed', err);
  }

  return finalizeRun({
    finalText:
      forceConcludeText ||
      '_Agent exited without producing any text. Check the run trace below to see which tools were called and what they returned._',
    trace,
    totalTokens,
    totalToolCalls,
    stopReason: lastStopReason || 'max_iterations',
    iterations: env.maxAgentIterations + 1,
    t0,
    executorBackend: 'messages',
  });
}

export const AgentExecutor = {
  async run(req: RunRequest): Promise<RunResult> {
    const useAgentSdk =
      (env.agentExecutorBackend ?? 'messages').toLowerCase() === 'agent-sdk';
    const includeCodeParserTools = env.enableCodeParserTools;
    const skills = [...req.agent.skills];
    const tools = MCPManager.toolsForSkills(skills, {
      includeCodeParserTools,
    });

    const wantsFsSkill =
      skills.includes('data-lineage') ||
      skills.includes('code-analysis') ||
      skills.includes('filesystem');
    if (!useAgentSdk && !env.useMcpFilesystemTools && wantsFsSkill) {
      log.warn(
        'USE_MCP_FILESYSTEM_TOOLS=false: Messages API has no MCP list_files/read_file. Set AGENT_EXECUTOR_BACKEND=agent-sdk for built-in Read/Glob/Grep, or set USE_MCP_FILESYSTEM_TOOLS=true for legacy MCP file tools.'
      );
    }

    let fsSandboxRoot: string;
    try {
      fsSandboxRoot = computeRunFsRoot(req.inputs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`invalid fs root: ${msg}`);
      return {
        markdown:
          `**Invalid repository path:** ${msg}\n\n` +
          'Set **Repository root** (Data Lineage) or **Repository Path** (Code Analyzer) to a folder the backend can read, or put an absolute path in **File paths** so the run root can be inferred. Optional: widen `FS_SANDBOX_ROOT` or set `FS_ALLOWED_ROOT` in `backend/.env`.',
        mermaid: null,
        metadata: {
          executionMs: 0,
          tokensUsed: 0,
          toolCalls: 0,
          iterations: 0,
          stopReason: 'invalid_fs_root',
          model: env.anthropicModel,
          mocked: false,
        },
      };
    }

    const runReq: RunRequest = { ...req, fsSandboxRoot };

    if (claudeAuthMode === 'none') {
      log.warn(
        'No Anthropic credentials configured — returning mock result. ' +
          'Set ANTHROPIC_API_KEY, or ANTHROPIC_AUTH_TOKEN (+ ANTHROPIC_BASE_URL for proxies like Databricks).'
      );
      const t0 = Date.now();
      const { markdown, mermaid } = await buildMockRun(runReq);
      return {
        markdown,
        mermaid,
        metadata: {
          executionMs: Date.now() - t0,
          tokensUsed: 0,
          toolCalls: 0,
          iterations: 0,
          stopReason: 'mock',
          model: 'mock',
          mocked: true,
        },
      };
    }

    try {
      if (useAgentSdk) {
        return await runWithAgentSdk(runReq, tools, {
          useNeo4j: Boolean(runReq.inputs.use_neo4j),
        });
      }
      return await runWithMessagesApi(runReq, tools);
    } catch (err) {
      log.error('claude call failed', err);
      const t0 = Date.now();
      const { markdown, mermaid } = await buildMockRun(runReq);
      return {
        markdown:
          `> **Note:** Claude call failed (${
            err instanceof Error ? err.message : String(err)
          }). Returning a mock report so you can verify the UI.\n\n` + markdown,
        mermaid,
        metadata: {
          executionMs: Date.now() - t0,
          tokensUsed: 0,
          toolCalls: 0,
          iterations: 0,
          stopReason: 'error',
          model: 'mock',
          mocked: true,
        },
      };
    }
  },
};
