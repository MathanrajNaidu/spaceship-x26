import { describe, expect, it } from 'vitest';

import { AccessDeniedError } from '../../../src/domain/errors/AccessDeniedError.js';
import { AuthenticationError } from '../../../src/domain/errors/AuthenticationError.js';
import { AuthorizationError } from '../../../src/domain/errors/AuthorizationError.js';
import {
  CapacityExceededError,
  ConflictError,
  PassengerInactiveError,
  ResourceDecommissionedError,
  ResourceInUseError,
  SessionAlreadyActiveError,
  SessionAlreadyEndedError,
  TierUnchangedError,
} from '../../../src/domain/errors/ConflictError.js';
import { DomainError } from '../../../src/domain/errors/DomainError.js';
import {
  CrewRosterInvariantError,
  InvariantViolationError,
} from '../../../src/domain/errors/InvariantViolationError.js';
import {
  NotFoundError,
  PassengerNotFoundError,
  ResourceNotFoundError,
  SessionNotFoundError,
} from '../../../src/domain/errors/NotFoundError.js';
import {
  InvalidCapacityError,
  InvalidNameError,
  InvalidResourceTypeError,
  InvalidTimeRangeError,
  InvalidTimestampError,
  InvalidTierError,
  ValidationError,
} from '../../../src/domain/errors/ValidationError.js';

describe('domain error hierarchy', () => {
  it('classifies validation failures', () => {
    const generic = new ValidationError('Name is required.');
    expect(generic).toBeInstanceOf(DomainError);
    expect(generic.code).toBe('VALIDATION_ERROR');
    expect(generic.details).toBeUndefined();

    const tier = new InvalidTierError('DIAMOND');
    expect(tier).toBeInstanceOf(ValidationError);
    expect(tier.code).toBe('INVALID_TIER');

    const capacity = new InvalidCapacityError(0);
    expect(capacity.code).toBe('INVALID_CAPACITY');
    expect(capacity.details).toEqual({ capacity: 0 });

    const type = new InvalidResourceTypeError('WARP_DRIVE');
    expect(type.code).toBe('INVALID_RESOURCE_TYPE');

    const name = new InvalidNameError();
    expect(name.code).toBe('INVALID_NAME');
    expect(name.message).toBe('Name must be between 1 and 100 characters.');

    const timestamp = new InvalidTimestampError();
    expect(timestamp.code).toBe('INVALID_TIMESTAMP');
    expect(timestamp.details).toBeUndefined();

    const range = new InvalidTimeRangeError('2026-02-02T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
    expect(range.code).toBe('INVALID_TIME_RANGE');
    expect(range.details).toEqual({
      from: '2026-02-02T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
    });
  });

  it('classifies missing entities', () => {
    const passenger = new PassengerNotFoundError('pas-1');
    const resource = new ResourceNotFoundError('res-1');
    const session = new SessionNotFoundError('ses-1');
    expect(passenger).toBeInstanceOf(NotFoundError);
    expect(resource).toBeInstanceOf(NotFoundError);
    expect(session).toBeInstanceOf(NotFoundError);
    expect(passenger.code).toBe('PASSENGER_NOT_FOUND');
    expect(resource.code).toBe('RESOURCE_NOT_FOUND');
    expect(session.code).toBe('SESSION_NOT_FOUND');
    expect(passenger.message).toBe("Passenger 'pas-1' was not found.");
  });

  it('classifies authentication and authorisation failures', () => {
    const unauthenticated = new AuthenticationError('Missing X-Actor-Id header.');
    const forbidden = new AuthorizationError('Crew lead access is required.');
    const denied = new AccessDeniedError('Passenger tier SILVER cannot access resource.', {
      requiredTier: 'PLATINUM',
      passengerTier: 'SILVER',
    });
    expect(unauthenticated.code).toBe('UNAUTHENTICATED');
    expect(unauthenticated.details).toBeUndefined();
    expect(forbidden.code).toBe('FORBIDDEN');
    expect(denied).toBeInstanceOf(DomainError);
    expect(denied.code).toBe('TIER_ACCESS_DENIED');
    expect(denied.details).toEqual({ requiredTier: 'PLATINUM', passengerTier: 'SILVER' });
  });

  it('classifies conflicts', () => {
    expect(new CapacityExceededError('Luxury O2 Pod A', 1, 1)).toMatchObject({
      code: 'CAPACITY_EXCEEDED',
      message: "Resource 'Luxury O2 Pod A' is at capacity (1/1).",
    });
    expect(new SessionAlreadyActiveError('Food Station Alpha', 'ses-1').code).toBe(
      'SESSION_ALREADY_ACTIVE',
    );
    expect(new SessionAlreadyEndedError('ses-1').code).toBe('SESSION_ALREADY_ENDED');
    expect(new ResourceDecommissionedError('VIP Rec Deck').code).toBe('RESOURCE_DECOMMISSIONED');
    expect(new PassengerInactiveError('Jonah Hale').code).toBe('PASSENGER_INACTIVE');
    expect(new TierUnchangedError('Jonah Hale', 'SILVER').message).toBe(
      "Passenger 'Jonah Hale' is already SILVER.",
    );

    const one = new ResourceInUseError('Food Station Alpha', 1);
    const many = new ResourceInUseError('Food Station Alpha', 2);
    expect(one).toBeInstanceOf(ConflictError);
    expect(one.message).toBe(
      "Resource 'Food Station Alpha' cannot be decommissioned while 1 session is active.",
    );
    expect(many.message).toBe(
      "Resource 'Food Station Alpha' cannot be decommissioned while 2 sessions are active.",
    );
  });

  it('classifies boot-time invariant failures', () => {
    const error = new CrewRosterInvariantError('Crew lead ids must be unique.', { ids: ['a'] });
    expect(error).toBeInstanceOf(InvariantViolationError);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('CREW_ROSTER_INVALID');
    expect(error.name).toBe('CrewRosterInvariantError');
  });
});
