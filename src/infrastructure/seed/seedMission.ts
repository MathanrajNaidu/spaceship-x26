import type { Actor } from '../../application/auth/Actor.js';
import type { PassengerService } from '../../application/services/PassengerService.js';
import type { ResourceService } from '../../application/services/ResourceService.js';
import type { CrewLead } from '../../domain/crew/CrewLead.js';
import { BASE_INVENTORY, DEMO_PASSENGERS } from './missionSeed.js';

export async function seedMission(input: {
  lead: CrewLead;
  passengerService: PassengerService;
  resourceService: ResourceService;
  seedDemoPassengers: boolean;
}): Promise<void> {
  const actor: Actor = { id: input.lead.id, role: 'CREW_LEAD', name: input.lead.name };
  for (const resource of BASE_INVENTORY) {
    await input.resourceService.provision(actor, resource);
  }
  if (!input.seedDemoPassengers) {
    return;
  }
  for (const passenger of DEMO_PASSENGERS) {
    await input.passengerService.create(actor, passenger);
  }
}
