import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 48;

/**
 * Query strings arrive as strings, so page/pageSize are coerced here — this is
 * the boundary where "12" becomes 12, and the only place that conversion is
 * allowed to happen.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginationMetaSchema = z.object({
  page: z.int().min(1),
  pageSize: z.int().min(1),
  total: z.int().nonnegative(),
  pageCount: z.int().nonnegative(),
});

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

/** Wraps an item schema in the list envelope every collection endpoint returns. */
export function paginatedSchema<TItem extends z.ZodType>(item: TItem) {
  return z.object({
    items: z.array(item),
    meta: paginationMetaSchema,
  });
}

export type Paginated<TItem> = {
  items: TItem[];
  meta: PaginationMeta;
};
