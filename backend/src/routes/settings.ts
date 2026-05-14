import { Router } from 'express';
import { SettingsModel, type Neo4jSettings } from '../models/Settings';
import { Neo4jMCP } from '../services/mcps/neo4j';
import { asyncHandler, HttpError } from '../utils/http';

export const settingsRouter = Router();

settingsRouter.get(
  '/neo4j',
  asyncHandler(async (_req, res) => {
    const cfg = await SettingsModel.get<Neo4jSettings>('neo4j');
    if (!cfg) {
      res.json({ configured: false });
      return;
    }
    res.json({
      configured: true,
      uri: cfg.uri,
      user: cfg.user,
    });
  })
);

settingsRouter.put(
  '/neo4j',
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<Neo4jSettings> | undefined;
    if (!body?.uri || !body.user || !body.password) {
      throw new HttpError(400, 'uri, user, and password are required');
    }
    await SettingsModel.set<Neo4jSettings>('neo4j', {
      uri: body.uri,
      user: body.user,
      password: body.password,
    });
    res.json({ ok: true });
  })
);

settingsRouter.post(
  '/neo4j/test',
  asyncHandler(async (_req, res) => {
    const result = await Neo4jMCP.testConnection();
    res.json(result);
  })
);
