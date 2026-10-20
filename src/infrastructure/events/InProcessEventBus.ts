import type { EventHandler, EventPublisher } from '../../application/ports/EventPublisher.js';
import type { DomainEvent } from '../../domain/events/DomainEvent.js';

/**
 * Delivers events synchronously, in subscription order, and waits for each
 * handler before returning. A failure stops the remaining handlers so a
 * caller never observes a partial side effect as success.
 */
export class InProcessEventBus implements EventPublisher {
  private readonly handlers: EventHandler[] = [];

  subscribe(handler: EventHandler): void {
    this.handlers.push(handler);
  }

  async publish(event: DomainEvent): Promise<void> {
    for (const handler of this.handlers) {
      await handler.handle(event);
    }
  }
}
