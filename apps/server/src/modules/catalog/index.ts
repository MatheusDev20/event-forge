/**
 * Catalog's public surface.
 *
 * Anything another bounded context is allowed to touch is re-exported here.
 * Everything else — entities, repositories, controllers — stays internal, and
 * the import-boundary rule in eslint.config.mjs turns a deep import into a lint
 * error rather than a code-review comment.
 */
export { CatalogModule } from './catalog.module';
export { CatalogService, type EventPage } from './application/catalog.service';
export type { EventCategory, EventStatus } from './domain/event';
export {
  SECTION_KINDS,
  seatMapCapacity,
  sectionCapacity,
  type LayoutSeat,
  type LayoutSection,
  type SeatMapLayout,
  type SectionCapacity,
  type SectionKind,
} from './domain/seat-map';
export type { ListEventsCriteria } from './domain/list-events-criteria';
