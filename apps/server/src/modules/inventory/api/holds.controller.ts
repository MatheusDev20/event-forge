import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { eventIdSchema } from '@repo/contracts/catalog';
import {
  listAvailabilityQuerySchema,
  placeHoldSchema,
  type Hold,
  type ListAvailabilityQuery,
  type ListAvailabilityResponse,
  type PlaceHoldInput,
} from '@repo/contracts/inventory';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import {
  anonymousHolderId,
  InventoryService,
} from '../application/inventory.service';
import { HoldRefusedError } from '../domain/hold';
import type { HoldRequest } from '../domain/hold';
import { toHttpFailure } from './hold-failure.mapper';
import { toAvailability, toHold } from './hold.mapper';

/**
 * Inventory's HTTP edge.
 *
 * Routed under `events/:eventId` rather than a top-level `/holds` because a
 * claim is meaningless without the event it is against, and a URL that says so
 * is one fewer thing a client can get wrong. The controller lives in Inventory
 * all the same — Catalog owns the noun in the path, not the resource under it.
 *
 * Open to anyone, like Catalog's controller. Authorization is Slice 4, and the
 * race does not need to know who is racing.
 */
@Controller('events/:eventId')
export class HoldsController {
  constructor(private readonly inventory: InventoryService) {}

  /**
   * What is still for sale, and the ids a hold request names.
   *
   * This endpoint exists so the experiment can be run by something other than
   * a psql prompt: allocation ids are Inventory's, and until seat maps are
   * rendered (deliberately deferred) there is no other way for a client to
   * learn one.
   *
   * Every `available` it returns is stale on arrival. That is stated in the
   * contract and it is not a defect — see `InventoryService.listAvailability`.
   */
  @Get('availability')
  async availability(
    @Param('eventId', new ZodValidationPipe(eventIdSchema)) eventId: string,
    @Query(new ZodValidationPipe(listAvailabilityQuerySchema))
    query: ListAvailabilityQuery,
  ): Promise<ListAvailabilityResponse> {
    const { items, total } = await this.inventory.listAvailability(eventId, {
      page: query.page,
      pageSize: query.pageSize,
      onlyAvailable: query.onlyAvailable,
    });

    return {
      items: items.map(toAvailability),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        pageCount: Math.ceil(total / query.pageSize),
      },
    };
  }

  /**
   * Claims units. **The endpoint the experiment fires N of at once.**
   *
   * `201` with the hold, or a failure that says which kind of failure it was:
   *
   * | Status | Code                     | Means                                  |
   * | ------ | ------------------------ | -------------------------------------- |
   * | 400    | VALIDATION_FAILED        | The body is malformed, or repeats a line |
   * | 404    | NOT_FOUND                | No such event, or not its allocations  |
   * | 409    | EVENT_NOT_ON_SALE        | Right request, closed doors            |
   * | 409    | ALLOCATION_UNAVAILABLE   | **Someone else got there first**       |
   *
   * The last row is the only one the race produces, and it is the one the test
   * counts. Distinguishing it from the other three is what stops a broken
   * client — or a dropped connection — from reading as a well-behaved loser.
   *
   * `201` rather than `200`: unlike publishing, this creates a resource, and
   * the hold in the body is that resource.
   */
  @Post('holds')
  @HttpCode(HttpStatus.CREATED)
  async place(
    @Param('eventId', new ZodValidationPipe(eventIdSchema)) eventId: string,
    @Body(new ZodValidationPipe(placeHoldSchema)) body: PlaceHoldInput,
  ): Promise<Hold> {
    try {
      return toHold(
        await this.inventory.placeHold(toHoldRequest(eventId, body)),
      );
    } catch (error) {
      // A refused claim is a result, not a fault: the service reports it in
      // the domain's vocabulary and this is where it becomes a status code.
      // Anything else is a genuine failure and goes to the filter untouched.
      if (error instanceof HoldRefusedError) {
        throw toHttpFailure(error.failure, eventId);
      }

      throw error;
    }
  }
}

/**
 * Wire body → domain claim.
 *
 * The event comes from the path and never from the body: two places to say
 * which event is one place for them to disagree, and the disagreement would be
 * silent — the allocations would simply belong to "another event" and 404.
 *
 * An absent `holderId` is minted here rather than defaulted in the schema. A
 * contract describes what crosses the network; inventing an identity is a
 * server decision, and putting `randomUUID` in a zod default would put it in
 * the browser bundle too.
 */
function toHoldRequest(eventId: string, body: PlaceHoldInput): HoldRequest {
  return {
    eventId,
    holderId: body.holderId ?? anonymousHolderId(),
    lines: body.lines.map((line) => ({
      allocationId: line.allocationId,
      quantity: line.quantity,
    })),
  };
}
