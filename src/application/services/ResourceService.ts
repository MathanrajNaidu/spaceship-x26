import type { Actor } from '../auth/Actor.js';
import type { Authorizer } from '../auth/Authorizer.js';
import { slicePage, type Page } from '../pagination.js';
import type { Clock } from '../ports/Clock.js';
import type { IdGenerator } from '../ports/IdGenerator.js';
import type { PassengerRepository } from '../ports/PassengerRepository.js';
import type { ResourceRepository, ResourceSearch } from '../ports/ResourceRepository.js';
import { AuthenticationError } from '../../domain/errors/AuthenticationError.js';
import { ResourceNotFoundError } from '../../domain/errors/NotFoundError.js';
import type { Passenger } from '../../domain/passenger/Passenger.js';
import { Resource, type ResourceStatus } from '../../domain/resource/Resource.js';
import { parseResourceType, type ResourceType } from '../../domain/resource/ResourceType.js';
import { MembershipTier, type TierName } from '../../domain/tier/MembershipTier.js';

export interface ResourceOccupancy {
  readonly active: number;
  readonly capacity: number;
  readonly availableSlots: number;
}

export interface ResourceDetails {
  readonly resource: Resource;
  readonly occupancy: ResourceOccupancy;
}

export interface DiscoveredResource {
  readonly resource: Resource;
  readonly availableSlots: number;
}

export interface ProvisionResourceInput {
  id?: string;
  name: string;
  type: string;
  capacity: number;
  minimumTier?: string;
}

export interface ResourceListQuery {
  status?: ResourceStatus;
  minimumTier?: TierName;
  type?: ResourceType;
  limit: number;
  offset: number;
}

export class ResourceService {
  constructor(
    private readonly authorizer: Authorizer,
    private readonly resources: ResourceRepository,
    private readonly passengers: PassengerRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async provision(actor: Actor, input: ProvisionResourceInput): Promise<Resource> {
    this.authorizer.requireCrewLead(actor);
    const resource = Resource.provision({
      id: input.id ?? this.ids.next('res'),
      name: input.name,
      type: parseResourceType(input.type),
      capacity: input.capacity,
      ...(input.minimumTier === undefined
        ? {}
        : { minimumTier: MembershipTier.from(input.minimumTier) }),
      now: this.clock.now(),
    });
    await this.resources.save(resource);
    return resource;
  }

  async list(actor: Actor, query: ResourceListQuery): Promise<Page<Resource>> {
    this.authorizer.requireCrewLead(actor);
    const filter: ResourceSearch = {};
    if (query.status !== undefined) {
      filter.status = query.status;
    }
    if (query.minimumTier !== undefined) {
      filter.minimumTier = query.minimumTier;
    }
    if (query.type !== undefined) {
      filter.type = query.type;
    }
    return slicePage(await this.resources.search(filter), query.limit, query.offset);
  }

  async get(actor: Actor, id: string): Promise<ResourceDetails> {
    this.authorizer.requireCrewLead(actor);
    const resource = await this.requireResource(id);
    return { resource, occupancy: this.occupancy(resource, 0) };
  }

  async discover(
    actor: Actor,
    query: { limit: number; offset: number },
  ): Promise<Page<DiscoveredResource>> {
    this.authorizer.requirePassenger(actor);
    const passenger = await this.requireActivePassenger(actor.id);
    const accessible = (await this.resources.search({ status: 'ACTIVE' })).filter((resource) =>
      resource.isAccessibleTo(passenger.tier),
    );
    const page = slicePage(accessible, query.limit, query.offset);
    return {
      ...page,
      items: page.items.map((resource) => ({
        resource,
        availableSlots: this.occupancy(resource, 0).availableSlots,
      })),
    };
  }

  private occupancy(resource: Resource, active: number): ResourceOccupancy {
    return {
      active,
      capacity: resource.capacity,
      availableSlots: resource.capacity - active,
    };
  }

  private async requireResource(id: string): Promise<Resource> {
    const resource = await this.resources.findById(id);
    if (!resource) {
      throw new ResourceNotFoundError(id);
    }
    return resource;
  }

  private async requireActivePassenger(id: string): Promise<Passenger> {
    const passenger = await this.passengers.findById(id);
    if (!passenger || passenger.status !== 'ACTIVE') {
      throw new AuthenticationError('Unknown or inactive actor.');
    }
    return passenger;
  }
}
