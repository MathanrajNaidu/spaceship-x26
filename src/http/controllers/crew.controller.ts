import type { Request, Response } from 'express';

import type { CrewLeadQuery } from '../../application/services/CrewLeadQuery.js';
import { requireActor } from '../requireActor.js';

export function crewController(crewLeads: CrewLeadQuery) {
  return {
    list: (req: Request, res: Response): void => {
      const data = crewLeads.list(requireActor(req));
      res.json({ data });
    },
  };
}
