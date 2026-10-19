import { z } from 'zod';

import { optionalPassengerStatusSchema, optionalTierSchema, paginationSchema } from './common.js';

export const createPassengerSchema = z.strictObject({
  name: z.string(),
  tier: z.string().min(1),
});

export const updatePassengerSchema = z.strictObject({
  name: z.string(),
});

export const passengerListSchema = paginationSchema.extend({
  tier: optionalTierSchema,
  status: optionalPassengerStatusSchema,
});
