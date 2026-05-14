import { Router } from 'express';
import { ConversationManager } from '../services/ConversationManager';
import { asyncHandler, HttpError } from '../utils/http';

export const conversationsRouter = Router();

conversationsRouter.get(
  '/:sessionId',
  asyncHandler(async (req, res) => {
    const details = await ConversationManager.load(req.params.sessionId);
    res.json(details);
  })
);

conversationsRouter.post(
  '/:sessionId/message',
  asyncHandler(async (req, res) => {
    const content = req.body?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      throw new HttpError(400, 'content is required');
    }
    const result = await ConversationManager.sendMessage({
      sessionId: req.params.sessionId,
      content: content.trim(),
    });
    res.json(result);
  })
);

conversationsRouter.post(
  '/:sessionId/switch-agent',
  asyncHandler(async (req, res) => {
    const agentId = Number(req.body?.agentId);
    if (!Number.isInteger(agentId) || agentId <= 0) {
      throw new HttpError(400, 'agentId is required');
    }
    const session = await ConversationManager.switchAgent(
      req.params.sessionId,
      agentId
    );
    res.json(session);
  })
);
