import {
  availableUnits,
  holdExpiry,
  lockOrder,
  refuseHold,
  HOLD_TTL_SECONDS,
  type HoldableAllocation,
  type HoldRequest,
} from './hold';

const EVENT = 'event-1';
const HOLDER = 'holder-1';

const allocation = (
  id: string,
  overrides: Partial<HoldableAllocation> = {},
): HoldableAllocation => ({
  id,
  eventId: EVENT,
  capacity: 1,
  held: 0,
  reserved: 0,
  ...overrides,
});

const found = (...allocations: HoldableAllocation[]) =>
  new Map(allocations.map((a) => [a.id, a]));

const asking = (...lines: (string | [string, number])[]): HoldRequest => ({
  eventId: EVENT,
  holderId: HOLDER,
  lines: lines.map((line) =>
    typeof line === 'string'
      ? { allocationId: line, quantity: 1 }
      : { allocationId: line[0], quantity: line[1] },
  ),
});

describe('availableUnits', () => {
  it('is capacity less everything claimed against it', () => {
    expect(
      availableUnits(allocation('a', { capacity: 500, held: 12, reserved: 3 })),
    ).toBe(485);
  });

  it('is zero for a seat someone holds', () => {
    expect(availableUnits(allocation('a', { held: 1 }))).toBe(0);
  });

  /**
   * The two shapes answer the same question with the same arithmetic, which is
   * why ADR-0006 gave a seat `capacity: 1` instead of a boolean.
   */
  it('is zero for a sold-out counter, by the same expression', () => {
    expect(
      availableUnits(
        allocation('a', { capacity: 500, held: 200, reserved: 300 }),
      ),
    ).toBe(0);
  });
});

describe('refuseHold', () => {
  it('grants a claim on a free seat', () => {
    expect(refuseHold(asking('a'), found(allocation('a')))).toBeNull();
  });

  it('grants a multi-seat claim when every seat is free', () => {
    expect(
      refuseHold(asking('a', 'b'), found(allocation('a'), allocation('b'))),
    ).toBeNull();
  });

  it('grants a partial slice of a general-admission counter', () => {
    expect(
      refuseHold(
        asking(['ga', 4]),
        found(allocation('ga', { capacity: 500, held: 496 })),
      ),
    ).toBeNull();
  });

  /**
   * The expected refusal. In a race for one seat this is what N−1 requests
   * get, and the reason the losers' *reason* is asserted rather than just
   * their status: a connection error is also "not a win".
   */
  it('refuses a seat someone else already holds', () => {
    expect(
      refuseHold(asking('a'), found(allocation('a', { held: 1 }))),
    ).toEqual({
      reason: 'insufficient_units',
      shortfalls: [{ allocationId: 'a', requested: 1, available: 0 }],
    });
  });

  it('refuses a seat that is reserved, not merely held', () => {
    expect(
      refuseHold(asking('a'), found(allocation('a', { reserved: 1 }))),
    ).toEqual({
      reason: 'insufficient_units',
      shortfalls: [{ allocationId: 'a', requested: 1, available: 0 }],
    });
  });

  it('refuses a counter with some units left but not enough', () => {
    expect(
      refuseHold(
        asking(['ga', 5]),
        found(allocation('ga', { capacity: 500, held: 497 })),
      ),
    ).toEqual({
      reason: 'insufficient_units',
      shortfalls: [{ allocationId: 'ga', requested: 5, available: 3 }],
    });
  });

  it('names every short line, not just the first', () => {
    const refusal = refuseHold(
      asking('a', 'b', 'c'),
      found(
        allocation('a', { held: 1 }),
        allocation('b'),
        allocation('c', { reserved: 1 }),
      ),
    );

    expect(refusal).toEqual({
      reason: 'insufficient_units',
      shortfalls: [
        { allocationId: 'a', requested: 1, available: 0 },
        { allocationId: 'c', requested: 1, available: 0 },
      ],
    });
  });

  /**
   * All or nothing. A claim for three seats where one is gone is refused
   * whole — granting the other two would hand back a hold the attendee never
   * asked for, and quietly take two seats out of circulation.
   */
  it('refuses the whole claim when one line of several is short', () => {
    expect(
      refuseHold(
        asking('a', 'b'),
        found(allocation('a'), allocation('b', { held: 1 })),
      ),
    ).not.toBeNull();
  });

  it('refuses an id it was given no row for', () => {
    expect(refuseHold(asking('ghost'), found())).toEqual({
      reason: 'unknown_allocations',
      allocationIds: ['ghost'],
    });
  });

  it('refuses an allocation belonging to another event', () => {
    expect(
      refuseHold(asking('a'), found(allocation('a', { eventId: 'event-2' }))),
    ).toEqual({ reason: 'unknown_allocations', allocationIds: ['a'] });
  });

  it('refuses the same allocation named twice', () => {
    expect(refuseHold(asking('a', 'a'), found(allocation('a')))).toEqual({
      reason: 'duplicate_lines',
      allocationIds: ['a'],
    });
  });

  /**
   * Ordered from "the request is malformed" to "the request lost". A duplicate
   * line is the caller's mistake whether or not the seat is also gone, and
   * reporting the loss instead would send them to look at the wrong thing.
   */
  it('reports a malformed request ahead of a lost one', () => {
    const refusal = refuseHold(
      asking('a', 'a'),
      found(allocation('a', { held: 1 })),
    );

    expect(refusal?.reason).toBe('duplicate_lines');
  });

  it('reports an unknown id ahead of a lost one', () => {
    const refusal = refuseHold(
      asking('ghost', 'a'),
      found(allocation('a', { held: 1 })),
    );

    expect(refusal?.reason).toBe('unknown_allocations');
  });
});

describe('lockOrder', () => {
  /**
   * The deadlock the sort exists to prevent: two claims naming the same seats
   * in opposite orders must still lock them in one shared order.
   */
  it('is the same for two requests naming the same seats in any order', () => {
    expect(lockOrder(asking('b', 'a', 'c'))).toEqual(
      lockOrder(asking('c', 'b', 'a')),
    );
  });

  it('sorts ascending', () => {
    expect(lockOrder(asking('c', 'a', 'b'))).toEqual(['a', 'b', 'c']);
  });

  it('collapses repeats, so the id list matches what a lock query needs', () => {
    expect(lockOrder(asking('a', 'a'))).toEqual(['a']);
  });
});

describe('holdExpiry', () => {
  it('is the TTL after the moment given', () => {
    const now = new Date('2026-09-04T12:00:00.000Z');

    expect(holdExpiry(now).toISOString()).toBe('2026-09-04T12:15:00.000Z');
    expect(holdExpiry(now, 30).toISOString()).toBe('2026-09-04T12:00:30.000Z');
  });

  it('takes the clock as an argument rather than reading it', () => {
    // The expiry experiment needs a controllable clock; this is the seam it
    // will use, and it costs nothing to leave open now.
    const now = new Date('2026-01-01T00:00:00.000Z');

    expect(holdExpiry(now).getTime() - now.getTime()).toBe(
      HOLD_TTL_SECONDS * 1000,
    );
  });
});
