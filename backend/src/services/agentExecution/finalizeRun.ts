import { env } from '../../config/env';
import { createLogger } from '../../utils/logger';
import type { IterationTrace, RunResult } from './types';

const log = createLogger('executor');

const TRACE_PREVIEW_CHARS = 240;

function preview(s: string, n = TRACE_PREVIEW_CHARS): string {
  const cleaned = s.replace(/\s+/g, ' ').trim();
  return cleaned.length > n ? cleaned.slice(0, n) + '…' : cleaned;
}

function extractMermaid(markdown: string): string | null {
  const m = markdown.match(/```mermaid\n([\s\S]*?)```/);
  return m?.[1]?.trim() ?? null;
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

export function finalizeRun(params: {
  finalText: string;
  trace: IterationTrace[];
  totalTokens: number;
  totalToolCalls: number;
  stopReason: string;
  iterations: number;
  t0: number;
  executorBackend?: 'messages' | 'agent-sdk';
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
    `done iters=${params.iterations} stop=${params.stopReason} text=${params.finalText.length}ch tools=${params.totalToolCalls} tokens=${params.totalTokens} elapsed=${Date.now() - params.t0}ms backend=${params.executorBackend ?? 'messages'}`
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
      executorBackend: params.executorBackend,
    },
  };
}
