import { Injectable, NotFoundException } from '@nestjs/common';
import type { ListEventsCriteria } from '../domain/list-events-criteria';
import type { EventEntity } from '../infrastructure/entities/event.entity';
import { EventsRepository } from '../infrastructure/events.repository';

export type EventPage = {
  items: EventEntity[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

/**
 * Catalog's public application surface. Other modules — and the HTTP edge —
 * call this; nothing reaches for EventsRepository directly.
 *
 * Note what is absent: no contract types. This layer speaks the domain's
 * language, and mapping to the wire shape happens in api/.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly events: EventsRepository) {}

  async listPublicEvents(criteria: ListEventsCriteria): Promise<EventPage> {
    const { items, total } = await this.events.listPublic(criteria);

    return {
      items,
      total,
      page: criteria.page,
      pageSize: criteria.pageSize,
      pageCount: Math.ceil(total / criteria.pageSize),
    };
  }

  async getPublicEventBySlug(slug: string): Promise<EventEntity> {
    const event = await this.events.findPublicBySlug(slug);

    if (!event) {
      // Deliberately the same response for "never existed" and "exists but is
      // still a draft": the public API must not leak an organizer's unpublished
      // event through a 403.
      throw new NotFoundException(`No published event with slug "${slug}"`);
    }

    return event;
  }
}
