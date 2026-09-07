import { listEventsQuerySchema } from './event';
import { MAX_PAGE_SIZE } from '../shared/pagination';

describe('listEventsQuerySchema', () => {
  it('applies defaults to an empty query', () => {
    expect(listEventsQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 12,
      sort: 'date_asc',
    });
  });

  it('coerces the numeric strings a query string actually delivers', () => {
    const parsed = listEventsQuerySchema.parse({ page: '3', pageSize: '24' });

    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(24);
  });

  it('caps pageSize so a client cannot ask for the whole table', () => {
    expect(() =>
      listEventsQuerySchema.parse({ pageSize: String(MAX_PAGE_SIZE + 1) }),
    ).toThrow();
  });

  it('rejects an unknown category rather than ignoring it', () => {
    expect(() => listEventsQuerySchema.parse({ category: 'opera' })).toThrow();
  });

  it('leaves featured undefined when the query does not mention it', () => {
    expect(listEventsQuerySchema.parse({}).featured).toBeUndefined();
  });

  it('reads featured=false as false, not as truthiness', () => {
    // The regression this exists for: `z.coerce.boolean()` would make this
    // `true`, so asking for the events that are *not* highlighted would return
    // exactly the ones that are.
    expect(listEventsQuerySchema.parse({ featured: 'false' }).featured).toBe(
      false,
    );
  });

  it('reads featured=true from the string a query string delivers', () => {
    expect(listEventsQuerySchema.parse({ featured: 'true' }).featured).toBe(
      true,
    );
  });

  it('accepts a real boolean, for callers building a query in code', () => {
    expect(listEventsQuerySchema.parse({ featured: true }).featured).toBe(true);
  });

  it('rejects a value that is neither spelling rather than guessing', () => {
    expect(() => listEventsQuerySchema.parse({ featured: 'yes' })).toThrow();
  });
});
