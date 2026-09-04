import type { AllocationAvailability, Hold } from '@repo/contracts/inventory';
import { availableUnits } from '../domain/hold';
import type { AllocationEntity } from '../infrastructure/entities/allocation.entity';
import type { HoldEntity } from '../infrastructure/entities/hold.entity';

/**
 * Entities → wire shapes. The only place Inventory's tables and the contract
 * package meet.
 *
 * Same split Catalog's `event.mapper.ts` makes, and for the same reason: the
 * service speaks the domain's language and knows nothing about JSON, while a
 * contract type must never reach the domain. Dates become ISO strings here and
 * nowhere else.
 */

export function toHold(hold: HoldEntity): Hold {
  return {
    id: hold.id,
    eventId: hold.eventId,
    holderId: hold.holderId,
    status: hold.status,
    expiresAt: hold.expiresAt.toISOString(),
    createdAt: hold.createdAt.toISOString(),
    lines: hold.lines.map((line) => ({
      allocationId: line.allocationId,
      quantity: line.quantity,
      kind: line.allocation.kind,
      // The labels come from the allocation, which froze them at publish time
      // (ADR-0006). A hold therefore prints the seat it took even after
      // Catalog re-letters the venue.
      sectionName: line.allocation.sectionName,
      rowLabel: line.allocation.rowLabel,
      seatLabel: line.allocation.seatLabel,
    })),
  };
}

/**
 * One allocation, as a browsable unit.
 *
 * `available` is computed rather than stored, by the same function the hold
 * path uses. Two expressions for "what is left" would be two chances to
 * disagree, and the one a client is shown must be the one it will be judged
 * against.
 */
export function toAvailability(
  allocation: AllocationEntity,
): AllocationAvailability {
  return {
    id: allocation.id,
    kind: allocation.kind,
    sectionName: allocation.sectionName,
    rowLabel: allocation.rowLabel,
    seatLabel: allocation.seatLabel,
    capacity: allocation.capacity,
    available: availableUnits(allocation),
  };
}
