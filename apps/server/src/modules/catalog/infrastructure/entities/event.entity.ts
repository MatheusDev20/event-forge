import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EVENT_CATEGORIES, EVENT_STATUSES } from '../../domain/event';
import type { EventCategory, EventStatus } from '../../domain/event';
import { OrganizerEntity } from './organizer.entity';
import { PriceTierEntity } from './price-tier.entity';
import { VenueEntity } from './venue.entity';

/** `'a', 'b'` — for embedding a domain union in a CHECK constraint. */
const sqlList = (values: readonly string[]): string =>
  values.map((value) => `'${value}'`).join(', ');

/**
 * Status and category are varchar with a CHECK constraint rather than a
 * Postgres enum type: adding a value to a PG enum is a migration that cannot
 * run inside a transaction with other DDL, and this project will add statuses.
 * The check gives the same integrity for a far cheaper change.
 *
 * Every index and constraint below is declared with the same name the migration
 * gives it. That is not decoration — `migration:generate` diffs the entities
 * against the live schema, and anything undeclared here reads as drift, so the
 * next generated migration would helpfully drop it.
 */
@Entity({ name: 'events' })
@Index('idx_events_slug', ['slug'], { unique: true })
@Index('idx_events_status_starts_at', ['status', 'startsAt'])
@Index('idx_events_category', ['category'])
@Index('idx_events_venue_id', ['venueId'])
@Index('idx_events_organizer_id', ['organizerId'])
@Check('events_status_check', `"status" IN (${sqlList(EVENT_STATUSES)})`)
@Check('events_category_check', `"category" IN (${sqlList(EVENT_CATEGORIES)})`)
@Check(
  'events_ends_after_starts_check',
  `"ends_at" IS NULL OR "ends_at" >= "starts_at"`,
)
export class EventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 180 })
  slug: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 32 })
  category: EventCategory;

  @Column({ type: 'varchar', length: 32 })
  status: EventStatus;

  @Column({ type: 'timestamptz', name: 'starts_at' })
  startsAt: Date;

  @Column({ type: 'timestamptz', name: 'ends_at', nullable: true })
  endsAt: Date | null;

  @Column({ type: 'timestamptz', name: 'doors_open_at', nullable: true })
  doorsOpenAt: Date | null;

  @Column({ type: 'text', name: 'hero_image_url', nullable: true })
  heroImageUrl: string | null;

  @Column({ type: 'uuid', name: 'venue_id' })
  venueId: string;

  @Column({ type: 'uuid', name: 'organizer_id' })
  organizerId: string;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;

  @ManyToOne(() => VenueEntity, (venue) => venue.events)
  @JoinColumn({
    name: 'venue_id',
    foreignKeyConstraintName: 'events_venue_id_fkey',
  })
  venue: VenueEntity;

  @ManyToOne(() => OrganizerEntity, (organizer) => organizer.events)
  @JoinColumn({
    name: 'organizer_id',
    foreignKeyConstraintName: 'events_organizer_id_fkey',
  })
  organizer: OrganizerEntity;

  @OneToMany(() => PriceTierEntity, (tier) => tier.event)
  priceTiers: PriceTierEntity[];
}
