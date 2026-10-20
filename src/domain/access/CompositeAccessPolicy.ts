import type { Passenger } from '../passenger/Passenger.js';
import type { Resource } from '../resource/Resource.js';
import type { AccessDecision, AccessPolicy } from './AccessPolicy.js';

export class CompositeAccessPolicy implements AccessPolicy {
  constructor(private readonly policies: readonly AccessPolicy[]) {}

  evaluate(passenger: Passenger, resource: Resource): AccessDecision {
    for (const policy of this.policies) {
      const decision = policy.evaluate(passenger, resource);
      if (!decision.allowed) {
        return decision;
      }
    }
    return { allowed: true };
  }
}
