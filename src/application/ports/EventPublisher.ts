import type { DomainEvent } from '../../domain/events/DomainEvent.js';

export interface EventHandler {
  handle(event: DomainEvent): Promise<void>;
}

export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
  subscribe(handler: EventHandler): void;
}
