import Anthropic from '@anthropic-ai/sdk';
import { claudeAuthMode, env } from '../config/env';
import { MCPManager, type ToolHandler } from './MCPManager';
import { buildMockRun } from './mockAgent';
import { createLogger } from '../utils/logger';
import type { AgentRow } from '../models/types';

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

export interface RunRequest {
  agent: AgentRow;
  sessionId: string;
  inputs: Record<string, unknown>;
  priorMarkdown?: string;
  userMessage?: string;
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
  };
}

const MAX_TOOL_RESULT_CHARS = 6_000;
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

function renderInputs(inputs: Record<string, unknown>): string {
  return Object.entries(inputs)
    .map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`)
    .join('\n');
}

function extractMermaid(markdown: string): string | null {
  const m = markdown.match(/```mermaid\n([\s\S]*?)```/);
  return m?.[1]?.trim() ?? null;
}

function buildInitialUserMessage(req: RunRequest): string {
  const lines: string[] = [];
  if (req.userMessage) {
    lines.push(req.userMessage);
    if (req.priorMarkdown) {
      lines.push('', 'Prior agent output (for context):', '');
      lines.push(req.priorMarkdown);
    }
  } else {
    lines.push(`Please run the **${req.agent.name}** agent with these inputs:`);
    lines.push('');
    lines.push(renderInputs(req.inputs));
    lines.push('');
    lines.push(
      'Produce a complete, well-structured markdown report. If the agent supports a Mermaid diagram and the inputs request one, include it in a ```mermaid fenced block.'
    );
  }
  return lines.join('\n');
}

function renderTraceMarkdown(trace: IterationTrace[]): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('<details><summary>Run trace (debug)</summary>');
  lines.push('');
  for (const t of trace) {
    lines.push(
      `**Iter ${t.iter + 1}** · stop=\`${t.stopReason ?? '?'}\` · ${t.elapsedMs} ms · in=${t.inputTokens} out=${t.outputTokens} · text=${t.textChars} chars · tools=${t.toolCalls.length}`
    );
    if (t.textPreview) {
      lines.push(`> ${t.textPreview}`);
    }
    for (const tc of t.toolCalls) {
      lines.push(
        `- \`${tc.name}\` ${tc.ok ? 'OK' : 'FAIL'} · ${tc.ms} ms · ${tc.resultBytes} B · args=${tc.argsPreview}`
      );
      if (!tc.ok || tc.resultBytes < 200) {
        lines.push(`  - ${preview(tc.resultPreview, 200)}`);
      }
    }
    lines.push('');
  }
  lines.push('</details>');
  return lines.join('\n');
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

async function runWithClaude(
  req: RunRequest,
  tools: ToolHandler[]
): Promise<RunResult> {
  const t0 = Date.now();
  const client = buildAnthropicClient();
  const trace: IterationTrace[] = [];
  let totalTokens = 0;
  let totalToolCalls = 0;
  let allAssistantText = '';
  let lastStopReason = '';

  const messages: AnthropicMessage[] = [
    {
      role: 'user',
      content: [{ type: 'text', text: buildInitialUserMessage(req) }],
    },
  ];

  const toolDefs = tools.map((t) => t.def);
  log.info(
    `start agent="${req.agent.name}" session=${req.sessionId} skills=[${req.agent.skills.join(',')}] tools=[${toolDefs.map((t) => t.name).join(',') || 'none'}] maxIter=${env.maxAgentIterations}`
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
    if (iterText) {
      allAssistantText = allAssistantText
        ? `${allAssistantText}\n\n${iterText}`
        : iterText;
    }

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
      return finalize({
        finalText: allAssistantText,
        trace,
        totalTokens,
        totalToolCalls,
        stopReason: lastStopReason,
        iterations: iter + 1,
        t0,
      });
    }

    const toolResults: AnthropicContent[] = [];
    for (const block of assistantContent) {
      if (block.type !== 'tool_use') continue;
      totalToolCalls++;
      const tcStart = Date.now();
      const argsPreview = summarizeArgs(block.input);
      log.info(`  tool_use → ${block.name} args=${argsPreview}`);

      const res = await MCPManager.runTool(
        block.name,
        (block.input as Record<string, unknown>) ?? {},
        { sessionId: req.sessionId }
      );

      const tcMs = Date.now() - tcStart;
      let resultStr: string;
      let resultBytes: number;
      if (res.ok) {
        resultStr = clampToolResult(res.data);
        resultBytes = resultStr.length;
        log.info(`    tool ok ${block.name} ${tcMs}ms ${resultBytes}B`);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: resultStr,
        });
      } else {
        resultStr = `Error: ${res.error}`;
        resultBytes = resultStr.length;
        log.warn(`    tool FAIL ${block.name} ${tcMs}ms — ${res.error}`);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: resultStr,
          is_error: true,
        });
      }
      iterTrace.toolCalls.push({
        name: block.name,
        argsPreview,
        ok: res.ok,
        resultPreview: preview(resultStr),
        resultBytes,
        ms: tcMs,
      });
    }

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
    if (finalText) {
      allAssistantText = allAssistantText
        ? `${allAssistantText}\n\n${finalText}`
        : finalText;
    }
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

  return finalize({
    finalText:
      allAssistantText ||
      '_Agent exited without producing any text. Check the run trace below to see which tools were called and what they returned._',
    trace,
    totalTokens,
    totalToolCalls,
    stopReason: lastStopReason || 'max_iterations',
    iterations: env.maxAgentIterations + 1,
    t0,
  });
}

function finalize(params: {
  finalText: string;
  trace: IterationTrace[];
  totalTokens: number;
  totalToolCalls: number;
  stopReason: string;
  iterations: number;
  t0: number;
}): RunResult {
  const incomplete =
    params.stopReason !== 'end_turn' && params.stopReason !== 'stop_sequence';
  const hadAnyToolFailure = params.trace.some((t) =>
    t.toolCalls.some((c) => !c.ok)
  );
  const showTrace = incomplete || hadAnyToolFailure;

  const markdown = showTrace
    ? params.finalText + renderTraceMarkdown(params.trace)
    : params.finalText;

  log.info(
    `done iters=${params.iterations} stop=${params.stopReason} text=${params.finalText.length}ch tools=${params.totalToolCalls} tokens=${params.totalTokens} elapsed=${Date.now() - params.t0}ms`
  );

  return {
    markdown,
    mermaid: extractMermaid(params.finalText),
    metadata: {
      executionMs: Date.now() - params.t0,
      tokensUsed: params.totalTokens,
      toolCalls: params.totalToolCalls,
      iterations: params.iterations,
      stopReason: params.stopReason,
      model: env.anthropicModel,
      mocked: false,
      trace: params.trace,
    },
  };
}

export const AgentExecutor = {
  async run(req: RunRequest): Promise<RunResult> {
    const tools = MCPManager.toolsForSkills(req.agent.skills);

    if (claudeAuthMode === 'none') {
      log.warn(
        'No Anthropic credentials configured — returning mock result. ' +
          'Set ANTHROPIC_API_KEY, or ANTHROPIC_AUTH_TOKEN (+ ANTHROPIC_BASE_URL for proxies like Databricks).'
      );
      const t0 = Date.now();
      const { markdown, mermaid } = await buildMockRun(req);
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
      return await runWithClaude(req, tools);
    } catch (err) {
      log.error('claude call failed', err);
      const t0 = Date.now();
      const { markdown, mermaid } = await buildMockRun(req);
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
