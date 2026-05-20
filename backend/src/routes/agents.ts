import { Router } from 'express';

import { env } from '../config/env';
import { AgentModel } from '../models/Agent';
import type { AgentRow } from '../models/types';
import { SessionModel } from '../models/Session';
import { OutputModel } from '../models/Output';
import { AgentExecutor } from '../services/AgentExecutor';
import { asyncHandler, HttpError } from '../utils/http';
import { progressEmitter } from '../services/agentExecution/progressEmitter';
import { createLogger } from '../utils/logger';

export const agentsRouter = Router();

const runLog = createLogger('agents-run');

/**
 * Runs the agent after HTTP returns `{ sessionId, pending: true }` so the client can open
 * SSE on GET /sessions/:sessionId/stream before work finishes.
 */
async function executeAgentJob(
  sessionId: string,
  agent: AgentRow,
  inputs: Record<string, unknown>
): Promise<void> {
  try {
    progressEmitter.emit(sessionId, {
      type: 'started',
      sessionId,
      timestamp: Date.now(),
      agentName: agent.name,
      maxIterations: env.maxAgentIterations,
    });

    const result = await AgentExecutor.run({
      agent,
      sessionId,
      inputs,
    });

    await OutputModel.create({
      session_id: sessionId,
      markdown_content: result.markdown,
      mermaid_content: result.mermaid,
      metadata: result.metadata as unknown as Record<string, unknown>,
    });

    const backend = result.metadata?.executorBackend;
    if (backend !== 'agent-sdk') {
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
      progressEmitter.complete(sessionId);
    }
  } catch (err) {
    runLog.error('async agent run failed', err);
    progressEmitter.emit(sessionId, {
      type: 'error',
      sessionId,
      timestamp: Date.now(),
      error: err instanceof Error ? err.message : String(err),
    });
    progressEmitter.complete(sessionId);
  }
}

function parseId(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new HttpError(400, `Invalid id '${raw}'`);
  }
  return n;
}

agentsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const agents = await AgentModel.list();
    res.json(agents);
  })
);

agentsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    if (!body.name || !body.system_prompt) {
      throw new HttpError(400, 'name and system_prompt are required');
    }
    const created = await AgentModel.create(body);
    res.status(201).json(created);
  })
);

agentsRouter.get(
  '/:id/config',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const agent = await AgentModel.findById(id);
    if (!agent) throw new HttpError(404, 'Agent not found');
    res.json(agent);
  })
);

agentsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const updated = await AgentModel.update(id, req.body ?? {});
    if (!updated) throw new HttpError(404, 'Agent not found');
    res.json(updated);
  })
);

agentsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const ok = await AgentModel.softDelete(id);
    if (!ok) throw new HttpError(404, 'Agent not found');
    res.json({ ok: true });
  })
);

agentsRouter.post(
  '/:id/run',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const agent = await AgentModel.findById(id);
    if (!agent) throw new HttpError(404, 'Agent not found');
    if (!agent.active) {
      throw new HttpError(400, 'Agent is inactive');
    }

    const inputs = (req.body?.inputs as Record<string, unknown>) ?? {};

    for (const p of agent.input_params) {
      if (p.required) {
        const v = inputs[p.name];
        const empty =
          v === undefined ||
          v === null ||
          v === '' ||
          (Array.isArray(v) && v.length === 0);
        if (empty) {
          throw new HttpError(400, `Missing required input '${p.name}'`);
        }
      }
    }

    const session = await SessionModel.create({ agentId: agent.id, inputs });

    void executeAgentJob(session.id, agent, inputs);

    res.json({
      sessionId: session.id,
      pending: true,
    });
  })
);
agentsRouter.get(
  '/sessions/:sessionId/stream',
  (req, res) => {
    const sessionId = req.params.sessionId;

    // Register SSE client
    progressEmitter.registerSSEClient(sessionId, res);

    // Keep-alive ping every 30 seconds
    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
      }
    }, 30000);

    // Cleanup on close
    res.on('close', () => {
      clearInterval(keepAlive);
    });
  }
);
