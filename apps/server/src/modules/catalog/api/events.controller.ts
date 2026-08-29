import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  createEventSchema,
  eventIdSchema,
  eventSlugSchema,
  listEventsQuerySchema,
  HERO_IMAGE_FIELD,
  HERO_IMAGE_MAX_BYTES,
  type CreateEventInput,
  type EventDetail,
  type ListEventsQuery,
  type ListEventsResponse,
} from '@repo/contracts/catalog';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { CatalogService } from '../application/catalog.service';
import type { ListEventsCriteria } from '../domain/list-events-criteria';
import type { HeroImageUpload } from '../domain/hero-image';
import type { NewEvent } from '../domain/new-event';
import { toEventDetail, toEventSummary } from './event.mapper';

/**
 * The slice of multer's file object this endpoint uses.
 *
 * Declared here rather than pulled from `Express.Multer.File`, which lives in
 * `@types/multer` — a dependency this project would otherwise be adding for
 * one type. Naming only what is read also documents the contract honestly:
 * every field below is written by the client, and `domain/hero-image.ts`
 * treats all three accordingly.
 */
type MultipartFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};

@Controller('events')
export class EventsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(listEventsQuerySchema))
    query: ListEventsQuery,
  ): Promise<ListEventsResponse> {
    const page = await this.catalog.listPublicEvents(toCriteria(query));

    return {
      items: page.items.map(toEventSummary),
      meta: {
        page: page.page,
        pageSize: page.pageSize,
        total: page.total,
        pageCount: page.pageCount,
      },
    };
  }

  /**
   * Anyone can call this today. Authorization is Slice 4 — until Identity
   * exists there is no one to check, and stubbing a fake organizer id into the
   * request would be a worse lie than an open endpoint.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createEventSchema))
    body: CreateEventInput,
  ): Promise<EventDetail> {
    return toEventDetail(await this.catalog.createEvent(toNewEvent(body)));
  }

  /**
   * Publishing is a transition, not a field update — hence a verb on its own
   * route rather than a PATCH carrying `status`. `createEventSchema` already
   * refuses to let a client name a status for the same reason: the rules that
   * guard this (a seat map, real capacity, every section priced) have nothing
   * to do with the shape of a request body, and after ADR-0006 the transition
   * also makes Inventory copy the layout. None of that survives being modelled
   * as an assignment.
   *
   * 200, not 201: this creates nothing. It returns the event so the caller can
   * see the status it landed in without a second round trip.
   *
   * Declared above `@Get(':slug')` by convention. The two cannot collide —
   * different method, different segment count — but a reader should not have
   * to prove that.
   *
   * Open to anyone, like `create`. Authorization is Slice 4.
   */
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  async publish(
    @Param('id', new ZodValidationPipe(eventIdSchema)) id: string,
  ): Promise<EventDetail> {
    return toEventDetail(await this.catalog.publishEvent(id));
  }

  /**
   * Opens sales on a published event.
   *
   * A second verb rather than a flag on publish, because they are two
   * decisions: publishing settles capacity and hands it to Inventory, going on
   * sale settles timing. Only an `on_sale` event accepts holds — which, from
   * Slice 2, is the state the race is run against.
   *
   * Open to anyone, like the rest of this controller. Authorization is Slice 4.
   */
  @Post(':id/on-sale')
  @HttpCode(HttpStatus.OK)
  async openSales(
    @Param('id', new ZodValidationPipe(eventIdSchema)) id: string,
  ): Promise<EventDetail> {
    return toEventDetail(await this.catalog.putEventOnSale(id));
  }

  /**
   * Replaces the event's hero image — the artwork behind its page.
   *
   * `POST`, not `PATCH`: the request body is the image itself, not a partial
   * event, and there is no JSON document here to merge into anything. It is a
   * sub-resource being written, so it gets its own route, the same way
   * publishing does.
   *
   * The interceptor is given no `storage`, which means multer's default —
   * memory. That is the point: the file has to be judged before it is allowed
   * to exist anywhere, and disk storage would have written it first and left
   * the cleanup of every rejected upload to us. `limits` is what keeps that
   * safe, because a memory buffer with no ceiling is a way to exhaust the
   * process.
   *
   * `limits` is the only validation here. Format is decided in the domain, on
   * the bytes — a `fileFilter` could only re-read the same client-written
   * headers, one layer earlier, and having two places answer "is this a JPEG"
   * is how they end up disagreeing.
   *
   * Declared above `@Get(':slug')` by convention, like `publish`.
   *
   * Open to anyone, like the rest of this controller. Authorization is Slice 4.
   */
  @Post(':id/hero-image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor(HERO_IMAGE_FIELD, {
      // `files: 1` matters as much as the size cap: without it a request can
      // send the field repeatedly and pay for N buffers to have N-1 discarded.
      limits: { fileSize: HERO_IMAGE_MAX_BYTES, files: 1 },
    }),
  )
  async setHeroImage(
    @Param('id', new ZodValidationPipe(eventIdSchema)) id: string,
    @UploadedFile() file: MultipartFile | undefined,
  ): Promise<EventDetail> {
    // No file at all is a malformed request rather than a rejected image, and
    // the domain never sees it — there are no bytes to have an opinion about.
    if (!file) {
      throw new BadRequestException(
        `Expected a multipart/form-data request with an image in the "${HERO_IMAGE_FIELD}" field`,
      );
    }

    return toEventDetail(
      await this.catalog.replaceHeroImage(id, toUpload(file)),
    );
  }

  @Get(':slug')
  async detail(
    @Param('slug', new ZodValidationPipe(eventSlugSchema)) slug: string,
  ): Promise<EventDetail> {
    return toEventDetail(await this.catalog.getPublicEventBySlug(slug));
  }
}

/** Wire query → domain criteria. The only place the two vocabularies meet. */
function toCriteria(query: ListEventsQuery): ListEventsCriteria {
  return {
    search: query.q,
    city: query.city,
    category: query.category,
    startsFrom: query.from ? new Date(query.from) : undefined,
    startsUntil: query.to ? new Date(query.to) : undefined,
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/**
 * Wire part → domain upload.
 *
 * The rename is the documentation: what multer calls `originalname` and
 * `mimetype` the domain calls a filename and a *declared* content type,
 * because that is all either of them is — a claim the sender made.
 */
function toUpload(file: MultipartFile): HeroImageUpload {
  return {
    filename: file.originalname,
    declaredContentType: file.mimetype,
    bytes: file.buffer,
  };
}

/** Wire body → domain draft. Dates become Dates, money stays in minor units. */
function toNewEvent(body: CreateEventInput): NewEvent {
  return {
    slug: body.slug,
    title: body.title,
    description: body.description,
    category: body.category,
    startsAt: new Date(body.startsAt),
    endsAt: body.endsAt ? new Date(body.endsAt) : null,
    doorsOpenAt: body.doorsOpenAt ? new Date(body.doorsOpenAt) : null,
    heroImageUrl: body.heroImageUrl,
    venueId: body.venueId,
    organizerId: body.organizerId,
    seatMapId: body.seatMapId,
    priceTiers: body.priceTiers.map((tier) => ({
      name: tier.name,
      amountMinor: tier.price.amountMinor,
      currency: tier.price.currency,
      sectionIds: tier.sectionIds,
    })),
  };
}
