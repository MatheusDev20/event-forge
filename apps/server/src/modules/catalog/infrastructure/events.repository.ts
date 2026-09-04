import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  In,
  Repository,
  type EntityManager,
  type SelectQueryBuilder,
} from 'typeorm';
import { PUBLICLY_VISIBLE_STATUSES } from '../domain/event';
import type { EventStatus } from '../domain/event';
import type { ListEventsCriteria } from '../domain/list-events-criteria';
import { INITIAL_EVENT_STATUS } from '../domain/new-event';
import type { NewEvent, ReferenceCheck } from '../domain/new-event';
import {
  ON_SALE_STATUS,
  PUBLISHABLE_FROM_STATUS,
  PUBLISHED_STATUS,
  SELLABLE_FROM_STATUS,
} from '../domain/publish-event';
import type { PublishCandidate, PublishSection } from '../domain/publish-event';
import type {
  LayoutSeat,
  LayoutSection,
  SeatMapLayout,
} from '../domain/seat-map';
import { EventEntity } from './entities/event.entity';
import { OrganizerEntity } from './entities/organizer.entity';
import { PriceTierEntity } from './entities/price-tier.entity';
import { PriceTierSectionEntity } from './entities/price-tier-section.entity';
import { SeatEntity } from './entities/seat.entity';
import { SeatMapEntity } from './entities/seat-map.entity';
import { SectionEntity } from './entities/section.entity';
import { VenueEntity } from './entities/venue.entity';

/**
 * Cheapest tier for an event, as a scalar subquery. Kept as a constant because
 * both the sort and (later) the availability projection need the same
 * definition of "price from".
 */
const MIN_TIER_PRICE = `(
  SELECT MIN(tier.price_amount_minor)
  FROM price_tiers tier
  WHERE tier.event_id = event.id
)`;

/**
 * How many seats a section actually contains, counted through its rows. Zero
 * for general admission, which has no rows by design — `sectionCapacity` reads
 * the counter column for those instead.
 */
const SECTION_SEAT_COUNT = `(
  SELECT COUNT(*)
  FROM seats seat
  JOIN seat_rows seat_row ON seat_row.id = seat.row_id
  WHERE seat_row.section_id = section.id
)`;

/**
 * Whether a price tier *of this event* covers the section.
 *
 * The join through price_tiers is the whole point: price_tier_sections alone
 * would answer "is this section priced by anyone", and a section priced only by
 * last year's event is not priced for this one.
 */
const SECTION_IS_PRICED = `EXISTS (
  SELECT 1
  FROM price_tier_sections mapping
  JOIN price_tiers tier ON tier.id = mapping.price_tier_id
  WHERE mapping.section_id = section.id
    AND tier.event_id = :eventId
)`;

const LIST_RELATIONS = {
  venue: true,
  organizer: true,
  priceTiers: true,
} as const;

@Injectable()
export class EventsRepository {
  constructor(
    @InjectRepository(EventEntity)
    private readonly events: Repository<EventEntity>,
  ) {}

  /**
   * Paginates in two steps — select the page of ids, then hydrate them.
   *
   * The single-query version joins price_tiers (a to-many) and then LIMITs,
   * which truncates rows rather than events. Selecting ids first means LIMIT
   * always counts events, and the hydration query is a clean fetch by id.
   */
  async listPublic(
    criteria: ListEventsCriteria,
  ): Promise<{ items: EventEntity[]; total: number }> {
    const filtered = this.applyFilters(
      this.events
        .createQueryBuilder('event')
        .innerJoin('event.venue', 'venue')
        .where('event.status IN (:...statuses)', {
          statuses: PUBLICLY_VISIBLE_STATUSES,
        }),
      criteria,
    );

    const total = await filtered.getCount();
    if (total === 0) return { items: [], total };

    const page = this.applySort(
      filtered
        .clone()
        .select('event.id', 'id')
        .addSelect(MIN_TIER_PRICE, 'min_price'),
      criteria.sort,
    )
      .offset((criteria.page - 1) * criteria.pageSize)
      .limit(criteria.pageSize);

    const rows = await page.getRawMany<{ id: string }>();
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) return { items: [], total };

    const items = await this.events.find({
      where: { id: In(ids) },
      relations: LIST_RELATIONS,
    });

    // `find` does not preserve the order of an IN list, so restore the order
    // the paginated query established.
    const position = new Map(ids.map((id, index) => [id, index]));
    items.sort((a, b) => position.get(a.id)! - position.get(b.id)!);

    return { items, total };
  }

  /** Any status, including drafts. For reading back what was just created. */
  findById(id: string): Promise<EventEntity | null> {
    return this.events.findOne({ where: { id }, relations: LIST_RELATIONS });
  }

  /**
   * Just the status, by id. Null when there is no such event.
   *
   * Separate from `findById` because this one is on the hold path, which is
   * the only latency-sensitive read in the system: `findById` joins the venue,
   * the organizer and every price tier to answer a question about one varchar.
   * `select` keeps it a single-column lookup on the primary key.
   */
  async findStatus(id: string): Promise<EventStatus | null> {
    const event = await this.events.findOne({
      where: { id },
      select: { status: true },
    });

    return event?.status ?? null;
  }

  /**
   * Checks everything a create request points at, in one round of queries.
   *
   * Two of these the database would catch on its own — a missing venue or
   * organizer fails the foreign key. The third it cannot: nothing stops
   * `price_tier_sections` referencing a section from an entirely different
   * venue's layout, because that table only ever sees section ids. So the check
   * lives here, and it is the reason this method exists rather than letting the
   * insert fail and translating the error.
   */
  async checkReferences(draft: NewEvent): Promise<ReferenceCheck> {
    const manager = this.events.manager;
    const sectionIds = [
      ...new Set(draft.priceTiers.flatMap((tier) => tier.sectionIds)),
    ];

    const [venueExists, organizerExists, seatMapBelongsToVenue, ownSections] =
      await Promise.all([
        manager.getRepository(VenueEntity).existsBy({ id: draft.venueId }),
        manager
          .getRepository(OrganizerEntity)
          .existsBy({ id: draft.organizerId }),
        manager
          .getRepository(SeatMapEntity)
          .existsBy({ id: draft.seatMapId, venueId: draft.venueId }),
        manager.getRepository(SectionEntity).find({
          where: { id: In(sectionIds), seatMapId: draft.seatMapId },
          select: { id: true },
        }),
      ]);

    const owned = new Set(ownSections.map((section) => section.id));

    return {
      venueExists,
      organizerExists,
      seatMapBelongsToVenue,
      foreignSectionIds: sectionIds.filter((id) => !owned.has(id)),
    };
  }

  /**
   * The event, its tiers, and the tier-to-section mapping, in one transaction.
   *
   * All or nothing is the only sensible boundary here: an event whose tiers
   * half-committed is priced wrongly rather than incompletely, and no read
   * anywhere would reveal it.
   */
  create(draft: NewEvent): Promise<string> {
    return this.events.manager.transaction(async (manager) => {
      const event = await manager.getRepository(EventEntity).save({
        slug: draft.slug,
        title: draft.title,
        description: draft.description,
        category: draft.category,
        status: INITIAL_EVENT_STATUS,
        startsAt: draft.startsAt,
        endsAt: draft.endsAt,
        doorsOpenAt: draft.doorsOpenAt,
        heroImageUrl: draft.heroImageUrl,
        venueId: draft.venueId,
        organizerId: draft.organizerId,
        seatMapId: draft.seatMapId,
      });

      for (const tier of draft.priceTiers) {
        const saved = await manager.getRepository(PriceTierEntity).save({
          eventId: event.id,
          name: tier.name,
          priceAmountMinor: tier.amountMinor,
          priceCurrency: tier.currency,
        });

        await manager.getRepository(PriceTierSectionEntity).save(
          tier.sectionIds.map((sectionId) => ({
            priceTierId: saved.id,
            sectionId,
          })),
        );
      }

      return event.id;
    });
  }

  /**
   * Everything the publish rule needs to judge one event, in two queries.
   *
   * Gathered here rather than judged here: this returns facts, and
   * `publishBlocker` decides what they mean. That split is what lets the rules
   * be unit-tested without a database.
   */
  async findPublishCandidate(id: string): Promise<PublishCandidate | null> {
    const event = await this.events.findOne({
      where: { id },
      relations: { priceTiers: true },
    });

    if (!event) return null;

    return {
      status: event.status,
      seatMapId: event.seatMapId,
      priceTierCount: event.priceTiers.length,
      // No seat map means no sections to fetch — and `no_seat_map` blocks the
      // publish before anything looks at this array anyway.
      sections:
        event.seatMapId === null
          ? []
          : await this.findPublishSections(event.id, event.seatMapId),
    };
  }

  /**
   * Runs work in one transaction.
   *
   * Exposed because `publishEvent` needs the status change and Inventory's
   * snapshot to commit together (ADR-0006), and the service is the layer that
   * knows both are part of one decision. The repository owns the connection;
   * it does not own what belongs inside the boundary.
   */
  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.events.manager.transaction(work);
  }

  /**
   * The whole layout of one seat map, flattened, for a context that is about
   * to copy it.
   *
   * One query with two joins rather than TypeORM's nested `relations`: the
   * result is consumed flat (an allocation row carries section, row and seat
   * labels side by side), and hydrating a three-level object graph only to
   * walk it back down costs an object per seat for a 50k-seat venue.
   *
   * Ordered so a snapshot is deterministic — two publishes of the same layout
   * produce allocations in the same order, which makes a diff between two runs
   * mean something.
   */
  async findSeatMapLayout(seatMapId: string): Promise<SeatMapLayout | null> {
    const exists = await this.events.manager
      .getRepository(SeatMapEntity)
      .existsBy({ id: seatMapId });

    if (!exists) return null;

    const rows = await this.events.manager
      .getRepository(SectionEntity)
      .createQueryBuilder('section')
      .leftJoin('seat_rows', 'seat_row', 'seat_row.section_id = section.id')
      .leftJoin(SeatEntity, 'seat', 'seat.row_id = seat_row.id')
      .select('section.id', 'section_id')
      .addSelect('section.name', 'section_name')
      .addSelect('section.kind', 'section_kind')
      .addSelect('section.capacity', 'section_capacity')
      .addSelect('section.display_order', 'section_order')
      .addSelect('seat_row.label', 'row_label')
      .addSelect('seat_row.display_order', 'row_order')
      .addSelect('seat.id', 'seat_id')
      .addSelect('seat.label', 'seat_label')
      .addSelect('seat.display_order', 'seat_order')
      .where('section.seat_map_id = :seatMapId', { seatMapId })
      .orderBy('section.display_order', 'ASC')
      .addOrderBy('seat_row.display_order', 'ASC', 'NULLS FIRST')
      .addOrderBy('seat.display_order', 'ASC', 'NULLS FIRST')
      .getRawMany<LayoutRow>();

    return { seatMapId, sections: groupIntoSections(rows) };
  }

  /**
   * The transition, as one conditional UPDATE.
   *
   * `AND status = 'draft'` is what makes two simultaneous publishes safe: both
   * can read a publishable draft, both can pass every rule, and exactly one
   * will match a row. The checks above exist to produce a clear message; this
   * line is the one that is actually authoritative — the same division of
   * labour as the slug's unique index behind `create`.
   *
   * `manager` is how this joins a caller's transaction, which is what lets the
   * status change and Inventory's snapshot commit together (ADR-0006) without
   * this class learning that Inventory exists.
   *
   * `updated_at` is set explicitly because the column is a plain default, not
   * an @UpdateDateColumn; without this it would still read as the moment the
   * draft was inserted.
   */
  markPublished(id: string, manager?: EntityManager): Promise<boolean> {
    return this.transitionStatus(
      id,
      PUBLISHABLE_FROM_STATUS,
      PUBLISHED_STATUS,
      manager,
    );
  }

  /**
   * Opening the doors: `published → on_sale`.
   *
   * Same conditional-UPDATE shape, and for the same reason — two callers can
   * both read a published event, and exactly one may be the one that opened
   * it. Nothing is snapshotted here, so it needs no transaction of its own.
   */
  markOnSale(id: string): Promise<boolean> {
    return this.transitionStatus(id, SELLABLE_FROM_STATUS, ON_SALE_STATUS);
  }

  /**
   * One status transition, guarded by the status it must be coming from.
   *
   * Extracted because both transitions are the same statement with different
   * nouns, and because the `WHERE status = :from` clause is the part that has
   * to stay identical: it is what makes each transition happen exactly once
   * under concurrency, and it would be easy to drop from a copy.
   */
  private async transitionStatus(
    id: string,
    from: EventStatus,
    to: EventStatus,
    manager?: EntityManager,
  ): Promise<boolean> {
    const repository = manager
      ? manager.getRepository(EventEntity)
      : this.events;

    const result = await repository
      .createQueryBuilder()
      .update(EventEntity)
      .set({ status: to, updatedAt: () => 'now()' })
      .where('id = :id AND status = :from', { id, from })
      .execute();

    return result.affected === 1;
  }

  /**
   * Points an event at a new hero image. False when no such event exists.
   *
   * Only the pointer moves. The bytes are already written and the previous
   * file is still on disk — deciding what happens to it is the service's job,
   * because it is the layer that knows the write succeeded.
   *
   * `updated_at` is set explicitly for the same reason `markPublished` does it:
   * the column is a plain default, not an @UpdateDateColumn, so without this
   * the row would still claim it was last touched when the draft was inserted.
   */
  async setHeroImageUrl(id: string, url: string): Promise<boolean> {
    const result = await this.events
      .createQueryBuilder()
      .update(EventEntity)
      .set({ heroImageUrl: url, updatedAt: () => 'now()' })
      .where('id = :id', { id })
      .execute();

    return result.affected === 1;
  }

  private async findPublishSections(
    eventId: string,
    seatMapId: string,
  ): Promise<PublishSection[]> {
    const rows = await this.events.manager
      .getRepository(SectionEntity)
      .createQueryBuilder('section')
      .select('section.id', 'id')
      .addSelect('section.name', 'name')
      .addSelect('section.kind', 'kind')
      .addSelect('section.capacity', 'capacity')
      .addSelect(SECTION_SEAT_COUNT, 'seat_count')
      .addSelect(SECTION_IS_PRICED, 'is_priced')
      .where('section.seat_map_id = :seatMapId', { seatMapId })
      .setParameter('eventId', eventId)
      .orderBy('section.display_order', 'ASC')
      .getRawMany<{
        id: string;
        name: string;
        kind: PublishSection['kind'];
        capacity: number | null;
        seat_count: string;
        is_priced: boolean;
      }>();

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      capacity: row.capacity,
      // COUNT() is a bigint, which pg hands back as a string rather than risk
      // a silent precision loss. Nothing downstream expects one.
      seatCount: Number(row.seat_count),
      isPriced: row.is_priced,
    }));
  }

  findPublicBySlug(slug: string): Promise<EventEntity | null> {
    return this.events.findOne({
      where: { slug, status: In([...PUBLICLY_VISIBLE_STATUSES]) },
      relations: LIST_RELATIONS,
    });
  }

  private applyFilters(
    qb: SelectQueryBuilder<EventEntity>,
    criteria: ListEventsCriteria,
  ): SelectQueryBuilder<EventEntity> {
    if (criteria.search) {
      qb.andWhere('(event.title ILIKE :search OR venue.name ILIKE :search)', {
        // ILIKE is fine at seed-data scale and honest about being a stopgap;
        // full-text search is a Slice 5 problem, not a Slice 0 one.
        search: `%${criteria.search}%`,
      });
    }

    if (criteria.city) {
      qb.andWhere('venue.city ILIKE :city', { city: criteria.city });
    }

    if (criteria.category) {
      qb.andWhere('event.category = :category', {
        category: criteria.category,
      });
    }

    if (criteria.startsFrom) {
      qb.andWhere('event.startsAt >= :startsFrom', {
        startsFrom: criteria.startsFrom,
      });
    }

    if (criteria.startsUntil) {
      qb.andWhere('event.startsAt <= :startsUntil', {
        startsUntil: criteria.startsUntil,
      });
    }

    return qb;
  }

  /**
   * Every sort ends with a tiebreak on id. Without one, rows that compare equal
   * can be ordered differently between two queries, and an item slips between
   * pages or shows up on both.
   */
  private applySort(
    qb: SelectQueryBuilder<EventEntity>,
    sort: ListEventsCriteria['sort'],
  ): SelectQueryBuilder<EventEntity> {
    switch (sort) {
      case 'date_desc':
        qb.orderBy('event.startsAt', 'DESC');
        break;
      case 'price_asc':
        qb.orderBy('min_price', 'ASC', 'NULLS LAST');
        break;
      case 'title_asc':
        qb.orderBy('event.title', 'ASC');
        break;
      case 'date_asc':
      default:
        qb.orderBy('event.startsAt', 'ASC');
        break;
    }

    return qb.addOrderBy('event.id', 'ASC');
  }
}

/** One row of the flattened layout query; seat columns are NULL for GA. */
type LayoutRow = {
  section_id: string;
  section_name: string;
  section_kind: LayoutSection['kind'];
  section_capacity: number | null;
  row_label: string | null;
  seat_id: string | null;
  seat_label: string | null;
};

/**
 * Rebuilds sections from the joined rows.
 *
 * A left join means a general-admission section — which has no rows and no
 * seats — still arrives, as a single row with every seat column NULL. That is
 * the case the `seat_id === null` guard exists for, and getting it wrong would
 * give every GA section one phantom seat.
 */
function groupIntoSections(rows: LayoutRow[]): LayoutSection[] {
  const sections = new Map<string, LayoutSection & { seats: LayoutSeat[] }>();

  for (const row of rows) {
    let section = sections.get(row.section_id);

    if (!section) {
      section = {
        id: row.section_id,
        name: row.section_name,
        kind: row.section_kind,
        capacity: row.section_capacity,
        seats: [],
      };
      sections.set(row.section_id, section);
    }

    // The GA case, and equally a seated section nobody has put seats in yet.
    if (row.seat_id === null || row.row_label === null) continue;

    section.seats.push({
      id: row.seat_id,
      rowLabel: row.row_label,
      seatLabel: row.seat_label ?? '',
    });
  }

  return [...sections.values()];
}
