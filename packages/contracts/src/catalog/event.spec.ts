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
});
