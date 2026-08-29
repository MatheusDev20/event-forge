import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type {
  DomainEventHandler,
  EventPublished,
} from '../../../shared/events';
import { InventoryService } from './inventory.service';

/**
 * `EventPublished` → allocations. The subscriber ADR-0006 called for, and the
 * one that makes the domain event bus load-bearing rather than decorative.
 *
 * Deliberately thin. A handler's job is to translate a fact into a call and
 * nothing else — the moment one starts making decisions, the rule it encodes
 * becomes invisible to anyone reading the service it belongs to.
 */
@Injectable()
export class SnapshotOnPublish implements DomainEventHandler<EventPublished> {
  readonly handles = 'EventPublished' as const;

  constructor(private readonly inventory: InventoryService) {}

  async handle(event: EventPublished, manager: EntityManager): Promise<void> {
    await this.inventory.snapshotPublishedEvent(
      event.eventId,
      event.seatMapId,
      manager,
    );
  }
}
