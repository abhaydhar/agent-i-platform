import { Router } from 'express';
import { SkillModel } from '../models/Skill';
import { asyncHandler, HttpError } from '../utils/http';

export const skillsRouter = Router();

function parseId(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new HttpError(400, `Invalid id '${raw}'`);
  }
  return n;
}

skillsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const skills = await SkillModel.list();
    res.json(skills);
  })
);

skillsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    if (!body.name) throw new HttpError(400, 'name is required');
    const created = await SkillModel.upsertByName(body);
    res.status(201).json(created);
  })
);

skillsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const updated = await SkillModel.update(id, req.body ?? {});
    if (!updated) throw new HttpError(404, 'Skill not found');
    res.json(updated);
  })
);
