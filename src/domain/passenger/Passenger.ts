import { PassengerInactiveError, TierUnchangedError } from '../errors/ConflictError.js';
import { ValidationError } from '../errors/ValidationError.js';
import { assertName } from '../shared/assertName.js';
import { MembershipTier } from '../tier/MembershipTier.js';

export type PassengerStatus = 'ACTIVE' | 'INACTIVE';

export interface PassengerSnapshot {
  id: string;
  name: string;
  tier: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface TierChange {
  from: MembershipTier;
  to: MembershipTier;
  direction: 'UPGRADE' | 'DOWNGRADE';
}

export interface CreatePassengerProps {
  id: string;
  name: string;
  tier: MembershipTier;
  now: Date;
}

export class Passenger {
  private constructor(
    readonly id: string,
    private _name: string,
    private _tier: MembershipTier,
    private _status: PassengerStatus,
    readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  get name(): string {
    return this._name;
  }

  get tier(): MembershipTier {
    return this._tier;
  }

  get status(): PassengerStatus {
    return this._status;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  static create(props: CreatePassengerProps): Passenger {
    const id = props.id.trim();
    if (id.length === 0) {
      throw new ValidationError('Passenger id must not be blank.');
    }
    return new Passenger(
      id,
      assertName(props.name, 'Passenger name'),
      props.tier,
      'ACTIVE',
      props.now,
      props.now,
    );
  }

  static reconstitute(snapshot: PassengerSnapshot): Passenger {
    if (snapshot.status !== 'ACTIVE' && snapshot.status !== 'INACTIVE') {
      throw new ValidationError(`Unknown passenger status '${snapshot.status}'.`);
    }
    return new Passenger(
      snapshot.id,
      assertName(snapshot.name, 'Passenger name'),
      MembershipTier.from(snapshot.tier),
      snapshot.status,
      parseInstant(snapshot.createdAt, 'createdAt'),
      parseInstant(snapshot.updatedAt, 'updatedAt'),
    );
  }

  toSnapshot(): PassengerSnapshot {
    return {
      id: this.id,
      name: this._name,
      tier: this._tier.name,
      status: this._status,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
    };
  }

  rename(name: string, now: Date): void {
    this.assertActive();
    this._name = assertName(name, 'Passenger name');
    this._updatedAt = now;
  }

  changeTier(tier: MembershipTier, now: Date): TierChange {
    this.assertActive();
    if (this._tier.equals(tier)) {
      throw new TierUnchangedError(this._name, tier.name);
    }
    const direction = tier.isHigherThan(this._tier) ? 'UPGRADE' : 'DOWNGRADE';
    const from = this._tier;
    this._tier = tier;
    this._updatedAt = now;
    return { from, to: tier, direction };
  }

  deactivate(now: Date): void {
    this.assertActive();
    this._status = 'INACTIVE';
    this._updatedAt = now;
  }

  private assertActive(): void {
    if (this._status === 'INACTIVE') {
      throw new PassengerInactiveError(this._name);
    }
  }
}

function parseInstant(value: string, label: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${label} is not a valid timestamp.`);
  }
  return parsed;
}
