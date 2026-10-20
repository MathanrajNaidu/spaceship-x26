import type { Request, Response } from 'express';

import type { PassengerService } from '../../application/services/PassengerService.js';
import type { Passenger } from '../../domain/passenger/Passenger.js';
import type { UsageSession } from '../../domain/usage/UsageSession.js';
import {
  changeTierSchema,
  createPassengerSchema,
  passengerListSchema,
  updatePassengerSchema,
} from '../schemas/passenger.schema.js';
import { idParamsSchema } from '../schemas/common.js';
import { requireActor } from '../requireActor.js';

export function passengerController(service: PassengerService) {
  return {
    create: async (req: Request, res: Response): Promise<void> => {
      const body = createPassengerSchema.parse(req.body);
      const passenger = await service.create(requireActor(req), body);
      res
        .status(201)
        .location(`/api/v1/passengers/${passenger.id}`)
        .json({ passenger: toPassengerDto(passenger) });
    },

    list: async (req: Request, res: Response): Promise<void> => {
      const query = passengerListSchema.parse(req.query);
      const page = await service.list(requireActor(req), query);
      res.json({
        data: page.items.map(toPassengerDto),
        page: { limit: page.limit, offset: page.offset, total: page.total },
      });
    },

    get: async (req: Request, res: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(req.params);
      const passenger = await service.get(requireActor(req), id);
      res.json({ passenger: toPassengerDto(passenger) });
    },

    update: async (req: Request, res: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(req.params);
      const body = updatePassengerSchema.parse(req.body);
      const passenger = await service.updateName(requireActor(req), id, body.name);
      res.json({ passenger: toPassengerDto(passenger) });
    },

    me: async (req: Request, res: Response): Promise<void> => {
      const passenger = await service.getOwn(requireActor(req));
      res.json({ passenger: toPassengerDto(passenger) });
    },

    changeTier: async (req: Request, res: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(req.params);
      const body = changeTierSchema.parse(req.body);
      const result = await service.changeTier(requireActor(req), id, body.tier);
      res.json({
        passenger: toPassengerDto(result.passenger),
        change: {
          from: result.change.from.name,
          to: result.change.to.name,
          direction: result.change.direction,
        },
        endedSessions: result.endedSessions.map(toSessionDto),
      });
    },

    deactivate: async (req: Request, res: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(req.params);
      const result = await service.deactivate(requireActor(req), id);
      res.json({
        passenger: toPassengerDto(result.passenger),
        endedSessions: result.endedSessions.map(toSessionDto),
      });
    },
  };
}

function toPassengerDto(passenger: Passenger) {
  return {
    id: passenger.id,
    name: passenger.name,
    tier: passenger.tier.name,
    status: passenger.status,
    createdAt: passenger.createdAt.toISOString(),
    updatedAt: passenger.updatedAt.toISOString(),
  };
}

function toSessionDto(session: UsageSession) {
  return {
    id: session.id,
    passengerId: session.passengerId,
    resourceId: session.resourceId,
    tierAtStart: session.tierAtStart.name,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    endReason: session.endReason ?? null,
  };
}
