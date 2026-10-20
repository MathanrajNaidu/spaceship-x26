import { z } from 'zod';

import { AUDIT_OUTCOMES } from '../../domain/audit/AuditEntry.js';
import {
  blankToUndefined,
  optionalInstantSchema,
  optionalTextSchema,
  paginationSchema,
} from './common.js';

export const auditQuerySchema = paginationSchema.extend({
  passengerId: optionalTextSchema,
  resourceId: optionalTextSchema,
  action: optionalTextSchema,
  outcome: z.preprocess(blankToUndefined, z.enum(AUDIT_OUTCOMES).optional()),
  from: optionalInstantSchema,
  to: optionalInstantSchema,
});
