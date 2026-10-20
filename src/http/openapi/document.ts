import type { OpenAPIV3 } from 'openapi-types';

import { AUDIT_OUTCOMES, AUDIT_ROLES } from '../../domain/audit/AuditEntry.js';
import { RESOURCE_TYPES } from '../../domain/resource/ResourceType.js';
import { TIERS } from '../../domain/tier/MembershipTier.js';
import { END_REASONS } from '../../domain/usage/UsageSession.js';
import { DEMAND_LEVELS } from '../../application/reporting/DemandClassifier.js';
import { idParamsSchema } from '../schemas/common.js';
import {
  changeTierSchema,
  createPassengerSchema,
  updatePassengerSchema,
} from '../schemas/passenger.schema.js';
import { provisionResourceSchema } from '../schemas/resource.schema.js';
import { startSessionSchema } from '../schemas/session.schema.js';
import { propertySchema, schemaFromZod } from './schemaFromZod.js';

const actorSecurity: OpenAPIV3.SecurityRequirementObject[] = [{ actorId: [] }];

const idSchema = propertySchema(idParamsSchema, 'id');

const tierSchema: OpenAPIV3.SchemaObject = { type: 'string', enum: [...TIERS] };
const resourceTypeSchema: OpenAPIV3.SchemaObject = { type: 'string', enum: [...RESOURCE_TYPES] };
const endReasonSchema: OpenAPIV3.SchemaObject = { type: 'string', enum: [...END_REASONS] };

const instant = (example: string): OpenAPIV3.SchemaObject => ({
  type: 'string',
  format: 'date-time',
  example,
});

const passengerExample = {
  id: 'pas-jonah',
  name: 'Jonah Hale',
  tier: 'SILVER',
  status: 'ACTIVE',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

const resourceExample = {
  id: 'res-food-1',
  name: 'Food Station Alpha',
  type: 'FOOD_STATION',
  minimumTier: 'SILVER',
  capacity: 8,
  status: 'ACTIVE',
  provisionedAt: '2026-06-01T00:00:00.000Z',
  decommissionedAt: null,
};

const sessionExample = {
  id: 'ses-1',
  passengerId: 'pas-jonah',
  resourceId: 'res-food-1',
  tierAtStart: 'SILVER',
  startedAt: '2026-06-01T12:00:00.000Z',
  endedAt: null,
  endReason: null,
};

function ref(name: string): OpenAPIV3.ReferenceObject {
  return { $ref: `#/components/schemas/${name}` };
}

function responseRef(name: string): OpenAPIV3.ReferenceObject {
  return { $ref: `#/components/responses/${name}` };
}

function jsonResponse(
  description: string,
  schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
  example?: unknown,
  headers?: OpenAPIV3.ResponseObject['headers'],
): OpenAPIV3.ResponseObject {
  return {
    description,
    ...(headers === undefined ? {} : { headers }),
    content: {
      'application/json': {
        schema,
        ...(example === undefined ? {} : { example }),
      },
    },
  };
}

function jsonBody(
  schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
  example: unknown,
): OpenAPIV3.RequestBodyObject {
  return {
    required: true,
    content: { 'application/json': { schema, example } },
  };
}

function pathId(example: string, description: string): OpenAPIV3.ParameterObject {
  return { name: 'id', in: 'path', required: true, description, schema: idSchema, example };
}

function queryParam(
  name: string,
  schema: OpenAPIV3.SchemaObject,
  description: string,
): OpenAPIV3.ParameterObject {
  return { name, in: 'query', required: false, description, schema };
}

const limitParam = queryParam(
  'limit',
  { type: 'integer', minimum: 1, maximum: 200, default: 50 },
  'Page size. Defaults to 50.',
);
const offsetParam = queryParam(
  'offset',
  { type: 'integer', minimum: 0, default: 0 },
  'Number of rows to skip.',
);
const pageParams = [limitParam, offsetParam];

const fromParam = queryParam(
  'from',
  instant('2026-06-01T00:00:00.000Z'),
  'Inclusive start of the window.',
);
const toParam = queryParam(
  'to',
  instant('2026-07-01T00:00:00.000Z'),
  'Exclusive end of the window. `from` later than `to` is 400 INVALID_TIME_RANGE.',
);

const pageSchema: OpenAPIV3.SchemaObject = {
  type: 'object',
  required: ['limit', 'offset', 'total'],
  properties: {
    limit: { type: 'integer', example: 50 },
    offset: { type: 'integer', example: 0 },
    total: { type: 'integer', example: 3 },
  },
};

const locationHeader = (example: string): NonNullable<OpenAPIV3.ResponseObject['headers']> => ({
  Location: { description: 'URL of the created resource.', schema: { type: 'string', example } },
});

function errors(
  ...names: Array<'BadRequest' | 'Unauthorized' | 'Forbidden' | 'NotFound' | 'Conflict'>
): OpenAPIV3.ResponsesObject {
  const responses: OpenAPIV3.ResponsesObject = {};
  for (const name of names) {
    const status = {
      BadRequest: '400',
      Unauthorized: '401',
      Forbidden: '403',
      NotFound: '404',
      Conflict: '409',
    }[name];
    responses[status] = responseRef(name);
  }
  return responses;
}

const authErrors = errors('BadRequest', 'Unauthorized', 'Forbidden');
const readErrors = errors('BadRequest', 'Unauthorized', 'Forbidden', 'NotFound');
const writeErrors = errors('BadRequest', 'Unauthorized', 'Forbidden', 'NotFound', 'Conflict');

const secured: Pick<OpenAPIV3.OperationObject, 'security'> = { security: actorSecurity };
const publicAccess: Pick<OpenAPIV3.OperationObject, 'security'> = { security: [] };

export const openApiDocument: OpenAPIV3.Document = {
  openapi: '3.0.3',
  info: {
    title: 'Spaceship X26 PRMS',
    version: '1.0.0',
    description:
      'Passenger resource management. Crew leads manage passengers and inventory. Passengers discover resources their tier allows and start or end a usage session. Send X-Actor-Id. Seeded crew: crew-ada, crew-bao, crew-mira. Seeded passengers: pas-jonah (SILVER), pas-priya (GOLD), pas-elena (PLATINUM).',
  },
  servers: [{ url: 'http://127.0.0.1:4317', description: 'Local API' }],
  tags: [
    { name: 'Health' },
    { name: 'Crew' },
    { name: 'Passengers' },
    { name: 'Resources' },
    { name: 'Sessions' },
    { name: 'Reports' },
    { name: 'Audit' },
    { name: 'Docs' },
  ],
  components: {
    securitySchemes: {
      actorId: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Actor-Id',
        description:
          'Actor id. Seeded crew leads are crew-ada, crew-bao and crew-mira. Seeded passengers are pas-jonah, pas-priya and pas-elena. Missing, unknown or inactive is 401. The wrong role is 403.',
      },
    },
    schemas: {
      ErrorBody: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message', 'requestId'],
            properties: {
              code: { type: 'string', example: 'TIER_ACCESS_DENIED' },
              message: { type: 'string' },
              requestId: { type: 'string', example: 'req-1' },
              details: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
      Passenger: {
        type: 'object',
        required: ['id', 'name', 'tier', 'status', 'createdAt', 'updatedAt'],
        properties: {
          id: { type: 'string', example: 'pas-jonah' },
          name: { type: 'string', example: 'Jonah Hale' },
          tier: tierSchema,
          status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
          createdAt: instant('2026-06-01T00:00:00.000Z'),
          updatedAt: instant('2026-06-01T00:00:00.000Z'),
        },
        example: passengerExample,
      },
      Resource: {
        type: 'object',
        required: [
          'id',
          'name',
          'type',
          'minimumTier',
          'capacity',
          'status',
          'provisionedAt',
          'decommissionedAt',
        ],
        properties: {
          id: { type: 'string', example: 'res-food-1' },
          name: { type: 'string' },
          type: resourceTypeSchema,
          minimumTier: tierSchema,
          capacity: { type: 'integer', minimum: 1 },
          status: { type: 'string', enum: ['ACTIVE', 'DECOMMISSIONED'] },
          provisionedAt: instant('2026-06-01T00:00:00.000Z'),
          decommissionedAt: { ...instant('2026-06-02T00:00:00.000Z'), nullable: true },
        },
        example: resourceExample,
      },
      Occupancy: {
        type: 'object',
        required: ['active', 'capacity', 'availableSlots'],
        properties: {
          active: { type: 'integer', example: 1 },
          capacity: { type: 'integer', example: 8 },
          availableSlots: { type: 'integer', example: 7 },
        },
      },
      Session: {
        type: 'object',
        required: [
          'id',
          'passengerId',
          'resourceId',
          'tierAtStart',
          'startedAt',
          'endedAt',
          'endReason',
        ],
        properties: {
          id: { type: 'string', example: 'ses-1' },
          passengerId: { type: 'string', example: 'pas-jonah' },
          resourceId: { type: 'string', example: 'res-food-1' },
          tierAtStart: tierSchema,
          startedAt: instant('2026-06-01T12:00:00.000Z'),
          endedAt: { ...instant('2026-06-01T13:00:00.000Z'), nullable: true },
          endReason: { ...endReasonSchema, nullable: true },
        },
        example: sessionExample,
      },
      AuditEntry: {
        type: 'object',
        required: [
          'id',
          'occurredAt',
          'actor',
          'action',
          'outcome',
          'passengerId',
          'resourceId',
          'sessionId',
          'reason',
          'metadata',
        ],
        properties: {
          id: { type: 'string' },
          occurredAt: instant('2026-06-01T12:00:00.000Z'),
          actor: {
            type: 'object',
            required: ['id', 'role'],
            properties: {
              id: { type: 'string', example: 'pas-jonah' },
              role: { type: 'string', enum: [...AUDIT_ROLES] },
            },
          },
          action: { type: 'string', example: 'USAGE_STARTED' },
          outcome: { type: 'string', enum: [...AUDIT_OUTCOMES] },
          passengerId: { type: 'string', nullable: true, example: 'pas-jonah' },
          resourceId: { type: 'string', nullable: true, example: 'res-lux-o2-1' },
          sessionId: { type: 'string', nullable: true },
          reason: { type: 'string', nullable: true, example: 'TIER_ACCESS_DENIED' },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      History: {
        type: 'object',
        required: ['passengerId', 'sessions', 'totalsByResourceType', 'daily'],
        properties: {
          passengerId: { type: 'string', example: 'pas-priya' },
          sessions: { type: 'array', items: ref('Session') },
          totalsByResourceType: {
            type: 'array',
            items: {
              type: 'object',
              required: ['type', 'sessions', 'totalDurationMs'],
              properties: {
                type: resourceTypeSchema,
                sessions: { type: 'integer' },
                totalDurationMs: { type: 'integer' },
              },
            },
          },
          daily: {
            type: 'array',
            items: {
              type: 'object',
              required: ['date', 'sessions', 'totalDurationMs'],
              properties: {
                date: { type: 'string', example: '2026-06-01' },
                sessions: { type: 'integer' },
                totalDurationMs: { type: 'integer' },
              },
            },
          },
        },
      },
      TierReport: {
        type: 'object',
        required: ['tiers'],
        properties: {
          tiers: {
            type: 'array',
            items: {
              type: 'object',
              required: ['tier', 'passengerCount', 'sessions', 'totalDurationMs', 'topResources'],
              properties: {
                tier: tierSchema,
                passengerCount: { type: 'integer' },
                sessions: { type: 'integer' },
                totalDurationMs: { type: 'integer' },
                topResources: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['resourceId', 'name', 'sessions', 'totalDurationMs'],
                    properties: {
                      resourceId: { type: 'string', example: 'res-food-1' },
                      name: { type: 'string' },
                      sessions: { type: 'integer' },
                      totalDurationMs: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      DemandReport: {
        type: 'object',
        required: ['data'],
        properties: {
          data: {
            type: 'array',
            items: {
              type: 'object',
              required: [
                'resourceId',
                'name',
                'status',
                'sessions',
                'totalDurationMs',
                'currentUtilisation',
                'peakUtilisation',
                'capacityDenials',
                'demandLevel',
              ],
              properties: {
                resourceId: { type: 'string', example: 'res-food-1' },
                name: { type: 'string' },
                status: { type: 'string', enum: ['ACTIVE', 'DECOMMISSIONED'] },
                sessions: { type: 'integer' },
                totalDurationMs: { type: 'integer' },
                currentUtilisation: { type: 'number' },
                peakUtilisation: { type: 'number' },
                capacityDenials: { type: 'integer' },
                demandLevel: { type: 'string', enum: [...DEMAND_LEVELS] },
              },
            },
          },
        },
      },
      ActiveUsage: {
        type: 'object',
        required: ['generatedAt', 'resources'],
        properties: {
          generatedAt: instant('2026-06-01T12:00:00.000Z'),
          resources: {
            type: 'array',
            items: {
              allOf: [
                ref('Resource'),
                {
                  type: 'object',
                  required: ['occupancy', 'sessions'],
                  properties: {
                    occupancy: ref('Occupancy'),
                    sessions: { type: 'array', items: ref('Session') },
                  },
                },
              ],
            },
          },
        },
      },
    },
    responses: {
      BadRequest: jsonResponse(
        'Validation failed, or the time window is invalid.',
        ref('ErrorBody'),
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed.',
            requestId: 'req-1',
            details: { issues: [{ path: 'name', message: 'Required' }] },
          },
        },
      ),
      Unauthorized: jsonResponse('Missing, unknown or inactive X-Actor-Id.', ref('ErrorBody'), {
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Unknown or inactive actor.',
          requestId: 'req-1',
        },
      }),
      Forbidden: jsonResponse(
        'The actor role cannot call this route, or the tier is too low.',
        ref('ErrorBody'),
        {
          error: {
            code: 'TIER_ACCESS_DENIED',
            message:
              "Passenger tier SILVER cannot access resource 'Luxury O2 Pod A' (requires PLATINUM).",
            requestId: 'req-1',
            details: { requiredTier: 'PLATINUM', passengerTier: 'SILVER' },
          },
        },
      ),
      NotFound: jsonResponse(
        'The passenger, resource, session or route does not exist.',
        ref('ErrorBody'),
        {
          error: {
            code: 'PASSENGER_NOT_FOUND',
            message: 'Passenger was not found.',
            requestId: 'req-1',
          },
        },
      ),
      Conflict: jsonResponse('The current state rejects the change.', ref('ErrorBody'), {
        error: {
          code: 'CAPACITY_EXCEEDED',
          message: 'Resource has no free slots.',
          requestId: 'req-1',
        },
      }),
    },
  },
  paths: {
    '/api/v1/health': {
      get: {
        ...publicAccess,
        tags: ['Health'],
        summary: 'Liveness',
        responses: {
          '200': jsonResponse(
            'The process is up.',
            {
              type: 'object',
              required: ['status'],
              properties: { status: { type: 'string', example: 'ok' } },
            },
            { status: 'ok' },
          ),
        },
      },
    },
    '/api/v1/crew-leads': {
      get: {
        ...secured,
        tags: ['Crew'],
        summary: 'List the three crew leads',
        parameters: [
          {
            name: 'X-Actor-Id',
            in: 'header',
            required: true,
            schema: { type: 'string', example: 'crew-ada' },
          },
        ],
        responses: {
          '200': jsonResponse(
            'The fixed roster.',
            {
              type: 'object',
              required: ['data'],
              properties: {
                data: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['id', 'name'],
                    properties: { id: { type: 'string' }, name: { type: 'string' } },
                  },
                },
              },
            },
            {
              data: [
                { id: 'crew-ada', name: 'Ada Okonkwo' },
                { id: 'crew-bao', name: 'Bao Chen' },
                { id: 'crew-mira', name: 'Mira Santos' },
              ],
            },
          ),
          ...errors('Unauthorized', 'Forbidden'),
        },
      },
    },
    '/api/v1/passengers': {
      post: {
        ...secured,
        tags: ['Passengers'],
        summary: 'Create a passenger',
        requestBody: jsonBody(schemaFromZod(createPassengerSchema), {
          name: 'Jonah Hale',
          tier: 'SILVER',
        }),
        responses: {
          '201': jsonResponse(
            'Passenger created.',
            {
              type: 'object',
              required: ['passenger'],
              properties: { passenger: ref('Passenger') },
            },
            { passenger: passengerExample },
            locationHeader('/api/v1/passengers/pas-jonah'),
          ),
          ...authErrors,
        },
      },
      get: {
        ...secured,
        tags: ['Passengers'],
        summary: 'List passengers',
        parameters: [
          ...pageParams,
          queryParam('tier', tierSchema, 'Filter by tier.'),
          queryParam(
            'status',
            { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
            'Filter by status.',
          ),
        ],
        responses: {
          '200': jsonResponse(
            'A page of passengers.',
            {
              type: 'object',
              required: ['data', 'page'],
              properties: { data: { type: 'array', items: ref('Passenger') }, page: pageSchema },
            },
            {
              data: [
                passengerExample,
                { ...passengerExample, id: 'pas-priya', name: 'Priya Nair', tier: 'GOLD' },
                { ...passengerExample, id: 'pas-elena', name: 'Elena Voss', tier: 'PLATINUM' },
              ],
              page: { limit: 50, offset: 0, total: 3 },
            },
          ),
          ...authErrors,
        },
      },
    },
    '/api/v1/passengers/{id}': {
      get: {
        ...secured,
        tags: ['Passengers'],
        summary: 'Read a passenger',
        parameters: [pathId('pas-jonah', 'Passenger id.')],
        responses: {
          '200': jsonResponse(
            'The passenger.',
            {
              type: 'object',
              required: ['passenger'],
              properties: { passenger: ref('Passenger') },
            },
            { passenger: passengerExample },
          ),
          ...readErrors,
        },
      },
      patch: {
        ...secured,
        tags: ['Passengers'],
        summary: 'Rename a passenger',
        parameters: [pathId('pas-jonah', 'Passenger id.')],
        requestBody: jsonBody(schemaFromZod(updatePassengerSchema), { name: 'Jonah Hale' }),
        responses: {
          '200': jsonResponse(
            'The updated passenger.',
            {
              type: 'object',
              required: ['passenger'],
              properties: { passenger: ref('Passenger') },
            },
            { passenger: passengerExample },
          ),
          ...writeErrors,
        },
      },
    },
    '/api/v1/passengers/{id}/tier': {
      put: {
        ...secured,
        tags: ['Passengers'],
        summary: 'Upgrade or downgrade a passenger',
        description:
          'A downgrade ends sessions on resources the new tier cannot use. pas-elena moving to SILVER is the usual check.',
        parameters: [pathId('pas-elena', 'Passenger id.')],
        requestBody: jsonBody(schemaFromZod(changeTierSchema), { tier: 'SILVER' }),
        responses: {
          '200': jsonResponse(
            'The passenger, the change, and sessions ended because of a downgrade.',
            {
              type: 'object',
              required: ['passenger', 'change', 'endedSessions'],
              properties: {
                passenger: ref('Passenger'),
                change: {
                  type: 'object',
                  required: ['from', 'to', 'direction'],
                  properties: {
                    from: tierSchema,
                    to: tierSchema,
                    direction: { type: 'string', enum: ['UPGRADE', 'DOWNGRADE'] },
                  },
                },
                endedSessions: { type: 'array', items: ref('Session') },
              },
            },
            {
              passenger: {
                ...passengerExample,
                id: 'pas-elena',
                name: 'Elena Voss',
                tier: 'SILVER',
              },
              change: { from: 'PLATINUM', to: 'SILVER', direction: 'DOWNGRADE' },
              endedSessions: [
                {
                  ...sessionExample,
                  passengerId: 'pas-elena',
                  resourceId: 'res-lux-o2-1',
                  tierAtStart: 'PLATINUM',
                  endedAt: '2026-06-01T13:00:00.000Z',
                  endReason: 'TIER_DOWNGRADED',
                },
              ],
            },
          ),
          ...writeErrors,
        },
      },
    },
    '/api/v1/passengers/{id}/deactivate': {
      post: {
        ...secured,
        tags: ['Passengers'],
        summary: 'Deactivate a passenger',
        description: 'Soft-delete. Ends active sessions with PASSENGER_DEACTIVATED.',
        parameters: [pathId('pas-jonah', 'Passenger id.')],
        responses: {
          '200': jsonResponse('The inactive passenger and the sessions that were ended.', {
            type: 'object',
            required: ['passenger', 'endedSessions'],
            properties: {
              passenger: ref('Passenger'),
              endedSessions: { type: 'array', items: ref('Session') },
            },
          }),
          ...writeErrors,
        },
      },
    },
    '/api/v1/passengers/{id}/history': {
      get: {
        ...secured,
        tags: ['Reports'],
        summary: "A passenger's usage history",
        parameters: [pathId('pas-elena', 'Passenger id.'), fromParam, toParam],
        responses: {
          '200': jsonResponse('Sessions, per-type totals and a daily trend.', ref('History'), {
            passengerId: 'pas-elena',
            sessions: [],
            totalsByResourceType: [],
            daily: [],
          }),
          ...readErrors,
        },
      },
    },
    '/api/v1/resources': {
      post: {
        ...secured,
        tags: ['Resources'],
        summary: 'Provision a resource',
        requestBody: jsonBody(schemaFromZod(provisionResourceSchema), {
          name: 'Spare Galley',
          type: 'FOOD_STATION',
          capacity: 4,
        }),
        responses: {
          '201': jsonResponse(
            'Resource provisioned.',
            { type: 'object', required: ['resource'], properties: { resource: ref('Resource') } },
            { resource: resourceExample },
            locationHeader('/api/v1/resources/res-food-1'),
          ),
          ...authErrors,
        },
      },
      get: {
        ...secured,
        tags: ['Resources'],
        summary: 'List the inventory',
        parameters: [
          ...pageParams,
          queryParam(
            'status',
            { type: 'string', enum: ['ACTIVE', 'DECOMMISSIONED'] },
            'Filter by status.',
          ),
          queryParam('minimumTier', tierSchema, 'Filter by minimum tier.'),
          queryParam('type', resourceTypeSchema, 'Filter by resource type.'),
        ],
        responses: {
          '200': jsonResponse(
            'A page of resources.',
            {
              type: 'object',
              required: ['data', 'page'],
              properties: { data: { type: 'array', items: ref('Resource') }, page: pageSchema },
            },
            { data: [resourceExample], page: { limit: 50, offset: 0, total: 1 } },
          ),
          ...authErrors,
        },
      },
    },
    '/api/v1/resources/{id}': {
      get: {
        ...secured,
        tags: ['Resources'],
        summary: 'Read a resource and its occupancy',
        parameters: [pathId('res-food-1', 'Resource id.')],
        responses: {
          '200': jsonResponse(
            'The resource and how full it is.',
            {
              type: 'object',
              required: ['resource', 'occupancy'],
              properties: { resource: ref('Resource'), occupancy: ref('Occupancy') },
            },
            {
              resource: resourceExample,
              occupancy: { active: 1, capacity: 8, availableSlots: 7 },
            },
          ),
          ...readErrors,
        },
      },
    },
    '/api/v1/resources/{id}/decommission': {
      post: {
        ...secured,
        tags: ['Resources'],
        summary: 'Decommission a resource',
        description: 'Rejected with 409 RESOURCE_IN_USE while sessions are still open.',
        parameters: [pathId('res-food-1', 'Resource id.')],
        responses: {
          '200': jsonResponse('The decommissioned resource.', {
            type: 'object',
            required: ['resource'],
            properties: { resource: ref('Resource') },
          }),
          ...writeErrors,
        },
      },
    },
    '/api/v1/me': {
      get: {
        ...secured,
        tags: ['Passengers'],
        summary: 'Read the caller profile',
        description: 'Call as pas-jonah, pas-priya or pas-elena.',
        responses: {
          '200': jsonResponse(
            'The passenger profile.',
            {
              type: 'object',
              required: ['passenger'],
              properties: { passenger: ref('Passenger') },
            },
            { passenger: passengerExample },
          ),
          ...errors('Unauthorized', 'Forbidden'),
        },
      },
    },
    '/api/v1/me/resources': {
      get: {
        ...secured,
        tags: ['Resources'],
        summary: 'Discover resources the caller can use',
        description:
          'pas-jonah sees SILVER resources such as res-food-1. res-lux-o2-1 stays hidden until the tier is high enough.',
        parameters: pageParams,
        responses: {
          '200': jsonResponse(
            'Active resources the caller tier can access, with free slots.',
            {
              type: 'object',
              required: ['data', 'page'],
              properties: {
                data: {
                  type: 'array',
                  items: {
                    allOf: [
                      ref('Resource'),
                      {
                        type: 'object',
                        required: ['availableSlots'],
                        properties: { availableSlots: { type: 'integer' } },
                      },
                    ],
                  },
                },
                page: pageSchema,
              },
            },
            {
              data: [{ ...resourceExample, availableSlots: 7 }],
              page: { limit: 50, offset: 0, total: 1 },
            },
          ),
          ...errors('BadRequest', 'Unauthorized', 'Forbidden'),
        },
      },
    },
    '/api/v1/me/sessions': {
      post: {
        ...secured,
        tags: ['Sessions'],
        summary: 'Start a usage session',
        description:
          'pas-jonah can start res-food-1. The same call with res-lux-o2-1 is 403 TIER_ACCESS_DENIED and is written to the audit log.',
        requestBody: jsonBody(schemaFromZod(startSessionSchema), { resourceId: 'res-food-1' }),
        responses: {
          '201': jsonResponse(
            'Session started.',
            { type: 'object', required: ['session'], properties: { session: ref('Session') } },
            { session: sessionExample },
            locationHeader('/api/v1/me/sessions/ses-1'),
          ),
          ...writeErrors,
        },
      },
      get: {
        ...secured,
        tags: ['Sessions'],
        summary: 'List the caller sessions',
        parameters: [
          queryParam(
            'status',
            { type: 'string', enum: ['active', 'ended'] },
            'Filter by active or ended.',
          ),
        ],
        responses: {
          '200': jsonResponse(
            'The caller sessions.',
            {
              type: 'object',
              required: ['data'],
              properties: { data: { type: 'array', items: ref('Session') } },
            },
            { data: [sessionExample] },
          ),
          ...errors('BadRequest', 'Unauthorized', 'Forbidden'),
        },
      },
    },
    '/api/v1/me/history': {
      get: {
        ...secured,
        tags: ['Reports'],
        summary: 'Personal usage history',
        description: 'Call as pas-priya. Totals use the tier stored on the session.',
        parameters: [fromParam, toParam],
        responses: {
          '200': jsonResponse('Sessions, per-type totals and a daily trend.', ref('History'), {
            passengerId: 'pas-priya',
            sessions: [{ ...sessionExample, passengerId: 'pas-priya', tierAtStart: 'GOLD' }],
            totalsByResourceType: [{ type: 'FOOD_STATION', sessions: 1, totalDurationMs: 0 }],
            daily: [{ date: '2026-06-01', sessions: 1, totalDurationMs: 0 }],
          }),
          ...errors('BadRequest', 'Unauthorized', 'Forbidden'),
        },
      },
    },
    '/api/v1/me/sessions/{id}/end': {
      post: {
        ...secured,
        tags: ['Sessions'],
        summary: 'End the caller session',
        parameters: [pathId('ses-1', 'Session id. Another passenger session is 404.')],
        responses: {
          '200': jsonResponse(
            'The ended session.',
            { type: 'object', required: ['session'], properties: { session: ref('Session') } },
            {
              session: {
                ...sessionExample,
                endedAt: '2026-06-01T13:00:00.000Z',
                endReason: 'PASSENGER_ENDED',
              },
            },
          ),
          ...writeErrors,
        },
      },
    },
    '/api/v1/sessions/{id}/end': {
      post: {
        ...secured,
        tags: ['Sessions'],
        summary: 'End any session',
        description: 'Crew only. The end reason is CREW_ENDED. crew-mira is a typical caller.',
        parameters: [pathId('ses-1', 'Session id.')],
        responses: {
          '200': jsonResponse(
            'The ended session.',
            { type: 'object', required: ['session'], properties: { session: ref('Session') } },
            {
              session: {
                ...sessionExample,
                endedAt: '2026-06-01T13:00:00.000Z',
                endReason: 'CREW_ENDED',
              },
            },
          ),
          ...writeErrors,
        },
      },
    },
    '/api/v1/audit-log': {
      get: {
        ...secured,
        tags: ['Audit'],
        summary: 'Query the audit log',
        description:
          'Includes denials. Filter outcome=DENIED to see pas-jonah refused res-lux-o2-1.',
        parameters: [
          ...pageParams,
          queryParam(
            'passengerId',
            { type: 'string', example: 'pas-jonah' },
            'Filter by passenger.',
          ),
          queryParam(
            'resourceId',
            { type: 'string', example: 'res-lux-o2-1' },
            'Filter by resource.',
          ),
          queryParam('action', { type: 'string' }, 'Filter by action name.'),
          queryParam(
            'outcome',
            { type: 'string', enum: [...AUDIT_OUTCOMES] },
            'SUCCESS or DENIED.',
          ),
          fromParam,
          toParam,
        ],
        responses: {
          '200': jsonResponse('A page of audit entries.', {
            type: 'object',
            required: ['data', 'page'],
            properties: { data: { type: 'array', items: ref('AuditEntry') }, page: pageSchema },
          }),
          ...authErrors,
        },
      },
    },
    '/api/v1/reports/active-usage': {
      get: {
        ...secured,
        tags: ['Reports'],
        summary: 'Live occupancy snapshot',
        responses: {
          '200': jsonResponse('Active resources and the sessions on them.', ref('ActiveUsage')),
          ...errors('Unauthorized', 'Forbidden'),
        },
      },
    },
    '/api/v1/reports/usage-by-tier': {
      get: {
        ...secured,
        tags: ['Reports'],
        summary: 'Usage grouped by tier at time of use',
        parameters: [fromParam, toParam],
        responses: {
          '200': jsonResponse('One group per tier, including empty tiers.', ref('TierReport'), {
            tiers: [
              {
                tier: 'SILVER',
                passengerCount: 1,
                sessions: 1,
                totalDurationMs: 0,
                topResources: [],
              },
              {
                tier: 'GOLD',
                passengerCount: 0,
                sessions: 0,
                totalDurationMs: 0,
                topResources: [],
              },
              {
                tier: 'PLATINUM',
                passengerCount: 0,
                sessions: 0,
                totalDurationMs: 0,
                topResources: [],
              },
            ],
          }),
          ...errors('BadRequest', 'Unauthorized', 'Forbidden'),
        },
      },
    },
    '/api/v1/reports/resource-demand': {
      get: {
        ...secured,
        tags: ['Reports'],
        summary: 'Demand, peak concurrency and capacity denials',
        parameters: [fromParam, toParam],
        responses: {
          '200': jsonResponse('Resources sorted by demand.', ref('DemandReport')),
          ...errors('BadRequest', 'Unauthorized', 'Forbidden'),
        },
      },
    },
    '/docs': {
      get: {
        ...publicAccess,
        tags: ['Docs'],
        summary: 'Interactive API docs',
        responses: {
          '200': {
            description: 'Swagger UI HTML.',
            content: { 'text/html': { schema: { type: 'string' } } },
          },
        },
      },
    },
    '/openapi.json': {
      get: {
        ...publicAccess,
        tags: ['Docs'],
        summary: 'This document',
        responses: {
          '200': {
            description: 'OpenAPI 3 JSON.',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
        },
      },
    },
  },
};
