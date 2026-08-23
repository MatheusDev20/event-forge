import type { EventCategory } from './event';

/** Catalog's own description of a list request, free of any wire concern. */
export type EventSortOrder =
  'date_asc' | 'date_desc' | 'price_asc' | 'title_asc';

export type ListEventsCriteria = {
  search?: string;
  city?: string;
  category?: EventCategory;
  startsFrom?: Date;
  startsUntil?: Date;
  sort: EventSortOrder;
  page: number;
  pageSize: number;
};
