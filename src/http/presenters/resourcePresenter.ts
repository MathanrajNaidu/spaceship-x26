import type { Resource } from '../../domain/resource/Resource.js';

export function toResourceDto(resource: Resource) {
  return {
    id: resource.id,
    name: resource.name,
    type: resource.type,
    minimumTier: resource.minimumTier.name,
    capacity: resource.capacity,
    status: resource.status,
    provisionedAt: resource.provisionedAt.toISOString(),
    decommissionedAt: resource.decommissionedAt?.toISOString() ?? null,
  };
}
