import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { ERROR_CODES } from '@repo/contracts/shared';
import type { HoldFailure } from '../domain/hold';

/**
 * A refused claim, as an HTTP failure.
 *
 * This lives in api/ rather than in the service because ADR-0003 puts contract
 * vocabulary — status codes, `ERROR_CODES` — at the edge and nowhere below it.
 * The domain decides *why* a claim failed; this decides what that costs a
 * client, which is a transport question and would be a different answer over
 * anything but HTTP.
 *
 * The split by status is the part worth reading twice, and it is not
 * cosmetic:
 *
 * - **400** — the request is malformed. Retrying the same body never works.
 * - **404** — the client is pointing at something that is not there for it.
 * - **409 EVENT_NOT_ON_SALE** — nothing wrong with the request; wrong moment.
 * - **409 ALLOCATION_UNAVAILABLE** — the request was right and it *lost*.
 *
 * Only the last one is produced by a race, and it is the one the experiment
 * counts. Collapsing these into a single 409 CONFLICT — which is what the
 * exception filter does by default — would let a malformed client, a closed
 * event and a dropped connection all read as well-behaved losers, and the
 * headline assertion ("N−1 refusals, every one because the seat was taken")
 * would quietly stop meaning anything.
 *
 * The switch is exhaustive on purpose: adding a reason to `HoldFailure` is a
 * compile error here, so a new way to fail cannot default into a 500.
 */
export function toHttpFailure(
  failure: HoldFailure,
  eventId: string,
): HttpException {
  switch (failure.reason) {
    case 'event_not_found':
      return new NotFoundException(`No event with id "${eventId}"`);

    case 'event_not_on_sale':
      return new ConflictException({
        code: ERROR_CODES.EVENT_NOT_ON_SALE,
        message: `Event "${eventId}" is "${failure.status}"; only an event on sale accepts holds`,
      });

    case 'duplicate_lines':
      return new BadRequestException(
        `Each allocation may appear once per hold; repeated: ${failure.allocationIds.join(', ')}. ` +
          'Ask for more units on one line instead',
      );

    case 'unknown_allocations':
      // Not "no such allocation": an id belonging to another event is
      // indistinguishable from one that does not exist, and confirming which
      // event an arbitrary id belongs to is not this endpoint's job.
      return new NotFoundException(
        `Not on sale for event "${eventId}": ${failure.allocationIds.join(', ')}`,
      );

    case 'insufficient_units':
      return new ConflictException({
        code: ERROR_CODES.ALLOCATION_UNAVAILABLE,
        message: failure.shortfalls
          .map(
            (short) =>
              `Allocation "${short.allocationId}" has ${short.available} unit(s) left; ${short.requested} requested`,
          )
          .join('; '),
        // Keyed by allocation so a client rendering a seat map can mark
        // exactly which of the seats it asked for went, without parsing prose.
        details: failure.shortfalls.map((short) => ({
          path: short.allocationId,
          message: `${short.available} of ${short.requested} available`,
        })),
      });
  }
}
