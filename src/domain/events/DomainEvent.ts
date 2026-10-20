export interface EventActor {
  readonly id: string;
  readonly role: 'CREW_LEAD' | 'PASSENGER';
}

interface EventBase {
  readonly occurredAt: Date;
  readonly actor: EventActor;
}

export interface PassengerCreated extends EventBase {
  readonly type: 'PassengerCreated';
  readonly passengerId: string;
  readonly name: string;
  readonly tier: string;
}

export interface PassengerUpdated extends EventBase {
  readonly type: 'PassengerUpdated';
  readonly passengerId: string;
  readonly name: string;
}

export interface PassengerDeactivated extends EventBase {
  readonly type: 'PassengerDeactivated';
  readonly passengerId: string;
}

export interface PassengerTierChanged extends EventBase {
  readonly type: 'PassengerTierChanged';
  readonly passengerId: string;
  readonly from: string;
  readonly to: string;
  readonly direction: 'UPGRADE' | 'DOWNGRADE';
}

export interface ResourceProvisioned extends EventBase {
  readonly type: 'ResourceProvisioned';
  readonly resourceId: string;
  readonly name: string;
  readonly resourceType: string;
  readonly minimumTier: string;
}

export interface ResourceDecommissioned extends EventBase {
  readonly type: 'ResourceDecommissioned';
  readonly resourceId: string;
}

export interface UsageStarted extends EventBase {
  readonly type: 'UsageStarted';
  readonly passengerId: string;
  readonly resourceId: string;
  readonly sessionId: string;
  readonly tierAtStart: string;
}

export interface UsageEnded extends EventBase {
  readonly type: 'UsageEnded';
  readonly passengerId: string;
  readonly resourceId: string;
  readonly sessionId: string;
  readonly endReason: string;
}

export interface UsageDenied extends EventBase {
  readonly type: 'UsageDenied';
  readonly passengerId: string;
  readonly resourceId: string;
  readonly reason: string;
}

export type DomainEvent =
  | PassengerCreated
  | PassengerUpdated
  | PassengerDeactivated
  | PassengerTierChanged
  | ResourceProvisioned
  | ResourceDecommissioned
  | UsageStarted
  | UsageEnded
  | UsageDenied;
