/**
 * Hold — a time-bounded, exclusive claim on specific Allocation units.
 *
 * `docs/domain-model.md` defines it in one sentence and this file is that
 * sentence's rules, minus the part no pure function can promise. The rules
 * below decide what *should* happen given a set of allocation rows; whether
 * those rows are still what they said they were when the UPDATE lands is
 * Postgres's answer, given under a lock in `holds.repository.ts` and backed by
 * `allocations_no_oversell_check`.
 *
 * That division is the whole design. **Nothing here is a concurrency
 * control.** `refuseHold` run against a stale read will happily approve a seat
 * someone else just took — which is precisely why it is called against rows
 * that are already locked, and why the constraint exists underneath even that.
 *
 * Pure, like Catalog's publish rules and like `allocation.ts`: no entities, no
 * Nest, no manager.
 */

/** The lifecycle of a claim. Only `active` is written today. */
export const HOLD_STATUSES = ['active', 'released', 'converted'] as const;

export type HoldStatus = (typeof HOLD_STATUSES)[number];

export const INITIAL_HOLD_STATUS: HoldStatus = 'active';

/**
 * How long a fresh hold is worth something.
 *
 * Fifteen minutes is the industry's habit and nothing here depends on the
 * number, because **nothing enforces it yet** — see the roadmap. It is a
 * constant rather than a literal so the expiry experiment has one place to
 * start from.
 */
export const HOLD_TTL_SECONDS = 15 * 60;

/** One line of a claim, as asked for. */
export type HoldLineRequest = {
  allocationId: string;
  quantity: number;
};

/** A whole claim, as asked for. */
export type HoldRequest = {
  eventId: string;
  holderId: string;
  lines: readonly HoldLineRequest[];
};

/**
 * An allocation as this decision needs to see it — the four numbers and the
 * identity, nothing else.
 */
export type HoldableAllocation = {
  id: string;
  eventId: string;
  capacity: number;
  held: number;
  reserved: number;
};

/** Why the units in a claim cannot be granted. */
export type HoldRefusal =
  | { reason: 'duplicate_lines'; allocationIds: string[] }
  /** Named ids that are not allocations of this event — or not allocations at all. */
  | { reason: 'unknown_allocations'; allocationIds: string[] }
  | {
      reason: 'insufficient_units';
      shortfalls: {
        allocationId: string;
        requested: number;
        available: number;
      }[];
    };

/**
 * Why a claim did not happen at all — the unit-level refusals above, plus the
 * two reasons that are about the *event* rather than about what is left of it.
 *
 * One union so there is one thing to map at the HTTP edge, and so a new reason
 * cannot be added without the mapper failing to compile.
 */
export type HoldFailure =
  | { reason: 'event_not_found' }
  /**
   * `docs/domain-model.md` is binding: only an `on_sale` event accepts holds.
   * The status is carried as a plain string rather than Catalog's EventStatus
   * — this context does not import that type, and what it does with the value
   * is repeat it back to the caller.
   */
  | { reason: 'event_not_on_sale'; status: string }
  | HoldRefusal;

/**
 * A claim that did not happen, as a throw.
 *
 * Deliberately not an HttpException. ADR-0003 keeps contract vocabulary —
 * status codes and `ERROR_CODES` among them — at the HTTP edge, and a service
 * that throws `ConflictException` has quietly decided that losing a seat is a
 * 409 in every future transport this application grows. The decision belongs
 * in api/, where `hold-failure.mapper.ts` makes it in one place, and where the
 * exhaustive switch means adding a reason here is a compile error there.
 */
export class HoldRefusedError extends Error {
  constructor(readonly failure: HoldFailure) {
    super(`Hold refused: ${failure.reason}`);
    this.name = 'HoldRefusedError';
  }
}

/** What is left of an allocation. The only arithmetic that matters here. */
export function availableUnits(allocation: HoldableAllocation): number {
  return allocation.capacity - allocation.held - allocation.reserved;
}

/**
 * The first reason this claim cannot be granted, or null.
 *
 * First rather than all, like `publishBlocker`, and ordered the same way: from
 * "this request does not make sense" to "this request makes sense and lost".
 * The order matters because the last case is the only one that is *expected* —
 * a race produces N−1 of them per second and none of the others — and mixing
 * a malformed request in with the losers would make the experiment's counts
 * mean two different things at once.
 *
 * `found` is keyed by allocation id and is expected to contain only rows the
 * caller has already locked. Passing it a stale read is not a bug this
 * function can detect; see the note at the top of the file.
 */
export function refuseHold(
  request: HoldRequest,
  found: ReadonlyMap<string, HoldableAllocation>,
): HoldRefusal | null {
  const duplicates = duplicateIds(request.lines);

  if (duplicates.length > 0) {
    // Two lines for one allocation would take twice the units under a single
    // quantity, and the unique index on hold_lines would reject the insert
    // anyway — as a constraint violation nobody can act on. Saying it here
    // costs one pass over at most twenty lines.
    return { reason: 'duplicate_lines', allocationIds: duplicates };
  }

  const unknown = request.lines
    .filter((line) => {
      const allocation = found.get(line.allocationId);

      // Belonging to the wrong event is indistinguishable from not existing,
      // on purpose: an allocation id is not a secret, but confirming which
      // event an arbitrary id belongs to is not this endpoint's job either.
      return !allocation || allocation.eventId !== request.eventId;
    })
    .map((line) => line.allocationId);

  if (unknown.length > 0) {
    return { reason: 'unknown_allocations', allocationIds: unknown };
  }

  const shortfalls = request.lines.flatMap((line) => {
    // Proven present by the check above.
    const available = availableUnits(found.get(line.allocationId)!);

    return available >= line.quantity
      ? []
      : [
          {
            allocationId: line.allocationId,
            requested: line.quantity,
            available,
          },
        ];
  });

  return shortfalls.length > 0
    ? { reason: 'insufficient_units', shortfalls }
    : null;
}

/** When a hold created now stops being worth anything. */
export function holdExpiry(now: Date, ttlSeconds = HOLD_TTL_SECONDS): Date {
  return new Date(now.getTime() + ttlSeconds * 1000);
}

/**
 * The allocation ids a claim touches, sorted.
 *
 * Sorted because that is the order they must be **locked** in. Two requests
 * asking for seats A and B in opposite orders will deadlock if each locks what
 * it happens to name first; a total order shared by every request in the
 * system makes that impossible rather than rare. The sort belongs here, next
 * to the rules, so the repository cannot quietly stop doing it.
 */
export function lockOrder(request: HoldRequest): string[] {
  return [...new Set(request.lines.map((line) => line.allocationId))].sort();
}

/** Ids named more than once in one request. */
function duplicateIds(lines: readonly HoldLineRequest[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();

  for (const line of lines) {
    if (seen.has(line.allocationId)) repeated.add(line.allocationId);
    seen.add(line.allocationId);
  }

  return [...repeated];
}
