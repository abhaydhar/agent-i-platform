import { db } from '../db/connection';
import { createLogger } from '../utils/logger';

const log = createLogger('token-stats');

/**
 * Anthropic pricing per 1M tokens (as of 2024)
 * Update these values based on current pricing from https://www.anthropic.com/pricing
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Claude 3.5 Sonnet
  'claude-3-5-sonnet-20240620': { input: 3.0, output: 15.0 },
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-5-20250929': { input: 3.0, output: 15.0 },
  'databricks-claude-sonnet-4-5': { input: 3.0, output: 15.0 },

  // Claude 3 Opus
  'claude-3-opus-20240229': { input: 15.0, output: 75.0 },

  // Claude 3 Haiku
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4.0 },

  // Default fallback (use Sonnet pricing)
  default: { input: 3.0, output: 15.0 },
};

function getPricing(model: string): { input: number; output: number } {
  return MODEL_PRICING[model] || MODEL_PRICING.default;
}

/**
 * Calculate cost in USD for given tokens and model
 */
function calculateCost(
  inputTokens: number,
  outputTokens: number,
  model: string
): number {
  const pricing = getPricing(model);
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
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

/**
 * Get aggregated token usage statistics for a specific session
 */
export async function getSessionTokenStats(sessionId: string): Promise<TokenStats> {
  try {
    const result = await db.query<{
      metadata: {
        tokensUsed?: number;
        model?: string;
        executionMs?: number;
        trace?: Array<{
          inputTokens: number;
          outputTokens: number;
        }>;
      };
    }>('SELECT metadata FROM outputs WHERE session_id = $1', [sessionId]);

    const stats: TokenStats = {
      totalTokens: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      totalExecutionMs: 0,
      runCount: result.rows.length,
      byModel: {},
    };

    for (const row of result.rows) {
      const metadata = row.metadata;
      const model = metadata.model || 'default';
      const tokensUsed = metadata.tokensUsed || 0;
      const executionMs = metadata.executionMs || 0;

      // Extract input/output tokens from trace
      let inputTokens = 0;
      let outputTokens = 0;
      if (metadata.trace && Array.isArray(metadata.trace)) {
        for (const iter of metadata.trace) {
          inputTokens += iter.inputTokens || 0;
          outputTokens += iter.outputTokens || 0;
        }
      } else {
        // Fallback: estimate 30% input, 70% output if trace not available
        inputTokens = Math.floor(tokensUsed * 0.3);
        outputTokens = Math.floor(tokensUsed * 0.7);
      }

      const cost = calculateCost(inputTokens, outputTokens, model);

      // Update totals
      stats.totalTokens += tokensUsed;
      stats.totalInputTokens += inputTokens;
      stats.totalOutputTokens += outputTokens;
      stats.totalCost += cost;
      stats.totalExecutionMs += executionMs;

      // Update per-model stats
      if (!stats.byModel[model]) {
        stats.byModel[model] = {
          tokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          runCount: 0,
        };
      }
      stats.byModel[model].tokens += tokensUsed;
      stats.byModel[model].inputTokens += inputTokens;
      stats.byModel[model].outputTokens += outputTokens;
      stats.byModel[model].cost += cost;
      stats.byModel[model].runCount += 1;
    }

    log.info(
      `Session ${sessionId} token stats: ${stats.totalTokens} tokens, $${stats.totalCost.toFixed(4)}, ${stats.totalExecutionMs}ms, ${stats.runCount} outputs`
    );

    return stats;
  } catch (err) {
    log.error(`Failed to get session token stats for ${sessionId}`, err);
    throw err;
  }
}

/**
 * Get aggregated token usage statistics from all outputs
 */
export async function getTokenStats(): Promise<TokenStats> {
  try {
    const result = await db.query<{
      metadata: {
        tokensUsed?: number;
        model?: string;
        executionMs?: number;
        trace?: Array<{
          inputTokens: number;
          outputTokens: number;
        }>;
      };
    }>('SELECT metadata FROM outputs');

    const stats: TokenStats = {
      totalTokens: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      totalExecutionMs: 0,
      runCount: result.rows.length,
      byModel: {},
    };

    for (const row of result.rows) {
      const metadata = row.metadata;
      const model = metadata.model || 'default';
      const tokensUsed = metadata.tokensUsed || 0;
      const executionMs = metadata.executionMs || 0;

      // Extract input/output tokens from trace
      let inputTokens = 0;
      let outputTokens = 0;
      if (metadata.trace && Array.isArray(metadata.trace)) {
        for (const iter of metadata.trace) {
          inputTokens += iter.inputTokens || 0;
          outputTokens += iter.outputTokens || 0;
        }
      } else {
        // Fallback: estimate 30% input, 70% output if trace not available
        inputTokens = Math.floor(tokensUsed * 0.3);
        outputTokens = Math.floor(tokensUsed * 0.7);
      }

      const cost = calculateCost(inputTokens, outputTokens, model);

      // Update totals
      stats.totalTokens += tokensUsed;
      stats.totalInputTokens += inputTokens;
      stats.totalOutputTokens += outputTokens;
      stats.totalCost += cost;
      stats.totalExecutionMs += executionMs;

      // Update per-model stats
      if (!stats.byModel[model]) {
        stats.byModel[model] = {
          tokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          runCount: 0,
        };
      }
      stats.byModel[model].tokens += tokensUsed;
      stats.byModel[model].inputTokens += inputTokens;
      stats.byModel[model].outputTokens += outputTokens;
      stats.byModel[model].cost += cost;
      stats.byModel[model].runCount += 1;
    }

    log.info(
      `Token stats: ${stats.totalTokens} tokens, $${stats.totalCost.toFixed(4)}, ${stats.totalExecutionMs}ms, ${stats.runCount} runs`
    );

    return stats;
  } catch (err) {
    log.error('Failed to get token stats', err);
    throw err;
  }
}

/**
 * Format cost as USD string
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Format number with commas
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}
