import { ResourceDecommissionedError } from '../errors/ConflictError.js';
import { InvalidCapacityError, ValidationError } from '../errors/ValidationError.js';
import { assertName } from '../shared/assertName.js';
import { MembershipTier } from '../tier/MembershipTier.js';
import { DEFAULT_MINIMUM_TIER, parseResourceType, type ResourceType } from './ResourceType.js';

export type ResourceStatus = 'ACTIVE' | 'DECOMMISSIONED';

export interface ResourceSnapshot {
  id: string;
  name: string;
  type: string;
  minimumTier: string;
  capacity: number;
  status: string;
  provisionedAt: string;
  decommissionedAt: string | null;
}

export interface ProvisionResourceProps {
  id: string;
  name: string;
  type: ResourceType;
  capacity: number;
  minimumTier?: MembershipTier;
  now: Date;
}

export class Resource {
  private constructor(
    readonly id: string,
    private _name: string,
    readonly type: ResourceType,
    private _minimumTier: MembershipTier,
    readonly capacity: number,
    private _status: ResourceStatus,
    readonly provisionedAt: Date,
    private _decommissionedAt: Date | undefined,
  ) {}

  get name(): string {
    return this._name;
  }

  get minimumTier(): MembershipTier {
    return this._minimumTier;
  }

  get status(): ResourceStatus {
    return this._status;
  }

  get decommissionedAt(): Date | undefined {
    return this._decommissionedAt;
  }

  static provision(props: ProvisionResourceProps): Resource {
    const id = props.id.trim();
    if (id.length === 0) {
      throw new ValidationError('Resource id must not be blank.');
    }
    return new Resource(
      id,
      assertName(props.name, 'Resource name'),
      props.type,
      props.minimumTier ?? MembershipTier.from(DEFAULT_MINIMUM_TIER[props.type]),
      assertCapacity(props.capacity),
      'ACTIVE',
      props.now,
      undefined,
    );
  }

  static reconstitute(snapshot: ResourceSnapshot): Resource {
    const status = parseStatus(snapshot.status);
    const decommissionedAt = parseDecommissionedAt(status, snapshot.decommissionedAt);
    return new Resource(
      snapshot.id,
      assertName(snapshot.name, 'Resource name'),
      parseResourceType(snapshot.type),
      MembershipTier.from(snapshot.minimumTier),
      assertCapacity(snapshot.capacity),
      status,
      parseInstant(snapshot.provisionedAt, 'provisionedAt'),
      decommissionedAt,
    );
  }

  toSnapshot(): ResourceSnapshot {
    return {
      id: this.id,
      name: this._name,
      type: this.type,
      minimumTier: this._minimumTier.name,
      capacity: this.capacity,
      status: this._status,
      provisionedAt: this.provisionedAt.toISOString(),
      decommissionedAt: this._decommissionedAt?.toISOString() ?? null,
    };
  }

  isAccessibleTo(tier: MembershipTier): boolean {
    return tier.includes(this._minimumTier);
  }

  decommission(now: Date): void {
    if (this._status === 'DECOMMISSIONED') {
      throw new ResourceDecommissionedError(this._name);
    }
    this._status = 'DECOMMISSIONED';
    this._decommissionedAt = now;
  }
}

export function assertCapacity(capacity: number): number {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new InvalidCapacityError(capacity);
  }
  return capacity;
}

function parseStatus(status: string): ResourceStatus {
  if (status === 'ACTIVE' || status === 'DECOMMISSIONED') {
    return status;
  }
  throw new ValidationError(`Unknown resource status '${status}'.`);
}

function parseDecommissionedAt(status: ResourceStatus, value: string | null): Date | undefined {
  if (status === 'ACTIVE') {
    if (value !== null) {
      throw new ValidationError('An active resource cannot have a decommissioned timestamp.');
    }
    return undefined;
  }
  if (value === null) {
    throw new ValidationError('A decommissioned resource requires a decommissioned timestamp.');
  }
  return parseInstant(value, 'decommissionedAt');
}

function parseInstant(value: string, label: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${label} is not a valid timestamp.`);
  }
  return parsed;
}
