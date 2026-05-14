import express from 'express';
import cors from 'cors';

import { agentsRouter } from './routes/agents';
import { skillsRouter } from './routes/skills';
import { conversationsRouter } from './routes/conversations';
import { settingsRouter } from './routes/settings';
import { errorHandler, notFound } from './utils/http';
import { db } from './db/connection';

export function createApp() {
  const app = express();

  app.use(cors({ origin: true }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', async (_req, res) => {
    const dbAvailable = await db.isAvailable();
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      db: dbAvailable ? 'connected' : 'disconnected',
    });
  });

  app.use('/api/agents', agentsRouter);
  app.use('/api/skills', skillsRouter);
  app.use('/api/conversations', conversationsRouter);
  app.use('/api/settings', settingsRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
