import { Router } from 'express';
import { getTokenStats, getSessionTokenStats } from '../services/TokenStatsService';
import { asyncHandler } from '../utils/http';

export const statsRouter = Router();

/**
 * GET /api/stats/tokens
 * Returns aggregated token usage and cost statistics
 */
statsRouter.get(
  '/tokens',
  asyncHandler(async (req, res) => {
    const stats = await getTokenStats();
    res.json(stats);
  })
);

/**
 * GET /api/stats/sessions/:sessionId/tokens
 * Returns token usage and cost statistics for a specific session
 */
statsRouter.get(
  '/sessions/:sessionId/tokens',
  asyncHandler(async (req, res) => {
    const stats = await getSessionTokenStats(req.params.sessionId);
    res.json(stats);
  })
);
