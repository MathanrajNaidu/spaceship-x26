import type { Request, Response } from 'express';

import type { UsageService } from '../../application/services/UsageService.js';
import { toSessionDto } from '../presenters/sessionPresenter.js';
import { requireActor } from '../requireActor.js';
import { idParamsSchema } from '../schemas/common.js';
import { sessionListSchema, startSessionSchema } from '../schemas/session.schema.js';

export function sessionController(service: UsageService) {
  return {
    start: async (req: Request, res: Response): Promise<void> => {
      const body = startSessionSchema.parse(req.body);
      const session = await service.startUsage(requireActor(req), body.resourceId);
      res
        .status(201)
        .location(`/api/v1/me/sessions/${session.id}`)
        .json({ session: toSessionDto(session) });
    },

    listMine: async (req: Request, res: Response): Promise<void> => {
      const query = sessionListSchema.parse(req.query);
      const sessions = await service.listOwn(requireActor(req), query.status);
      res.json({ data: sessions.map(toSessionDto) });
    },

    endMine: async (req: Request, res: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(req.params);
      const session = await service.endOwn(requireActor(req), id);
      res.json({ session: toSessionDto(session) });
    },

    endByCrew: async (req: Request, res: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(req.params);
      const session = await service.endByCrew(requireActor(req), id);
      res.json({ session: toSessionDto(session) });
    },
  };
}
