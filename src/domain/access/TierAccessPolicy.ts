import type { Passenger } from '../passenger/Passenger.js';
import type { Resource } from '../resource/Resource.js';
import type { AccessDecision, AccessPolicy } from './AccessPolicy.js';

export class TierAccessPolicy implements AccessPolicy {
  evaluate(passenger: Passenger, resource: Resource): AccessDecision {
    if (passenger.tier.includes(resource.minimumTier)) {
      return { allowed: true };
    }
    return {
      allowed: false,
      code: 'TIER_ACCESS_DENIED',
      message: `Passenger tier ${passenger.tier.name} cannot access resource '${resource.name}' (requires ${resource.minimumTier.name}).`,
      details: {
        requiredTier: resource.minimumTier.name,
        passengerTier: passenger.tier.name,
      },
    };
  }
}
