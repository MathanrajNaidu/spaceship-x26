import type {
  ResourceRepository,
  ResourceSearch,
} from '../../../application/ports/ResourceRepository.js';
import { Resource } from '../../../domain/resource/Resource.js';

export class InMemoryResourceRepository implements ResourceRepository {
  private readonly items = new Map<string, ReturnType<Resource['toSnapshot']>>();

  save(resource: Resource): Promise<void> {
    this.items.set(resource.id, resource.toSnapshot());
    return Promise.resolve();
  }

  findById(id: string): Promise<Resource | null> {
    const snapshot = this.items.get(id);
    return Promise.resolve(snapshot ? Resource.reconstitute(snapshot) : null);
  }

  search(filter: ResourceSearch): Promise<Resource[]> {
    const matches = [...this.items.values()]
      .filter((snapshot) => matchesResource(snapshot, filter))
      .sort(byProvisionedThenId)
      .map((snapshot) => Resource.reconstitute(snapshot));
    return Promise.resolve(matches);
  }
}

function matchesResource(
  snapshot: ReturnType<Resource['toSnapshot']>,
  filter: ResourceSearch,
): boolean {
  if (filter.status !== undefined && snapshot.status !== filter.status) {
    return false;
  }
  if (filter.minimumTier !== undefined && snapshot.minimumTier !== filter.minimumTier) {
    return false;
  }
  if (filter.type !== undefined && snapshot.type !== filter.type) {
    return false;
  }
  return true;
}

function byProvisionedThenId(
  left: ReturnType<Resource['toSnapshot']>,
  right: ReturnType<Resource['toSnapshot']>,
): number {
  const byTime = left.provisionedAt.localeCompare(right.provisionedAt);
  return byTime !== 0 ? byTime : left.id.localeCompare(right.id);
}
