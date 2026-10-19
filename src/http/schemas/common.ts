import { z } from 'zod';

import { RESOURCE_TYPES } from '../../domain/resource/ResourceType.js';
import { TIERS } from '../../domain/tier/MembershipTier.js';

const blankToUndefined = (value: unknown): unknown =>
  value === '' || value === undefined ? undefined : value;

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const idParamsSchema = z.object({
  id: z.string().min(1),
});

export const optionalTierSchema = z.preprocess(blankToUndefined, z.enum(TIERS).optional());

export const optionalPassengerStatusSchema = z.preprocess(
  blankToUndefined,
  z.enum(['ACTIVE', 'INACTIVE']).optional(),
);

export const optionalResourceStatusSchema = z.preprocess(
  blankToUndefined,
  z.enum(['ACTIVE', 'DECOMMISSIONED']).optional(),
);

export const optionalResourceTypeSchema = z.preprocess(
  blankToUndefined,
  z.enum(RESOURCE_TYPES).optional(),
);
