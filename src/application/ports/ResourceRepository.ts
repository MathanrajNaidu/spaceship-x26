import type { Resource, ResourceStatus } from '../../domain/resource/Resource.js';
import type { ResourceType } from '../../domain/resource/ResourceType.js';
import type { TierName } from '../../domain/tier/MembershipTier.js';

export interface ResourceSearch {
  status?: ResourceStatus;
  minimumTier?: TierName;
  type?: ResourceType;
}

export interface ResourceRepository {
  save(resource: Resource): Promise<void>;
  findById(id: string): Promise<Resource | null>;
  search(filter: ResourceSearch): Promise<Resource[]>;
}
