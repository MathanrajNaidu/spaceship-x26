import type { Passenger } from '../passenger/Passenger.js';
import type { Resource } from '../resource/Resource.js';

export type AccessDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly code: string;
      readonly message: string;
      readonly details: Readonly<Record<string, unknown>>;
    };

export interface AccessPolicy {
  evaluate(passenger: Passenger, resource: Resource): AccessDecision;
}
