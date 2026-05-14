import { Router } from 'express';

import { AgentModel } from '../models/Agent';
import { SessionModel } from '../models/Session';
import { OutputModel } from '../models/Output';
import { AgentExecutor } from '../services/AgentExecutor';
import { asyncHandler, HttpError } from '../utils/http';

export const agentsRouter = Router();

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
    const result = await AgentExecutor.run({
      agent,
      sessionId: session.id,
      inputs,
    });

    await OutputModel.create({
      session_id: session.id,
      markdown_content: result.markdown,
      mermaid_content: result.mermaid,
      metadata: result.metadata as unknown as Record<string, unknown>,
    });

    res.json({
      sessionId: session.id,
      markdown: result.markdown,
      mermaid: result.mermaid ?? undefined,
      metadata: result.metadata,
    });
  })
);
