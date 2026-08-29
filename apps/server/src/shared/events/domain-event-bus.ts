import { Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { DomainEvent, DomainEventName } from './domain-event';

/**
 * A subscriber to one kind of fact.
 *
 * `handle` is given the publisher's `EntityManager`, and that parameter is the
 * entire design. See DomainEventBus below for why.
 */
export interface DomainEventHandler<E extends DomainEvent = DomainEvent> {
  /** Which fact this reacts to. */
  readonly handles: E['name'];
  handle(event: E, manager: EntityManager): Promise<void>;
}

/**
 * In-process, synchronous, and transactional. All three are deliberate.
 *
 * **Synchronous, inside the publisher's transaction.** ADR-0006 requires that
 * publishing an event and snapshotting its seat map either both happen or
 * neither does: an event that is `published` with no allocations is an event
 * on sale with nothing to sell, and it is not a state any later request could
 * repair. A queue, or Nest's EventEmitter, would hand the subscriber a fact
 * that is not committed yet and no way to refuse it. Passing the manager means
 * a handler's writes join the caller's transaction, and a handler that throws
 * rolls the publisher back — which is exactly the coupling we want here, and
 * the reason this is not a message bus pretending to be one.
 *
 * The cost is honest and worth stating: a slow handler is slow *for the
 * publisher*, and a broken handler fails the publisher's request. That is
 * acceptable precisely because publishing is rare and not latency-sensitive
 * (ADR-0006 chose to put expensive work here for that reason). It would not be
 * acceptable on the hold path, and this bus should not grow to serve it — when
 * a subscriber genuinely may fail independently, it wants an outbox, not this.
 *
 * **Subscription rather than injection.** Handlers register themselves in their
 * own module's `onModuleInit`, so a context owns what it listens to and the
 * composition root stays ignorant. Catalog emits `EventPublished` without
 * knowing Inventory exists — which is the property the context map is drawn
 * around.
 */
@Injectable()
export class DomainEventBus {
  private readonly logger = new Logger(DomainEventBus.name);
  private readonly handlers = new Map<DomainEventName, DomainEventHandler[]>();

  /** Called by a context's module at boot. Order of registration is order of execution. */
  subscribe(handler: DomainEventHandler): void {
    const existing = this.handlers.get(handler.handles) ?? [];

    this.handlers.set(handler.handles, [...existing, handler]);
  }

  /**
   * Runs every subscriber to this fact, in the caller's transaction.
   *
   * Sequential, not `Promise.all`: the handlers share one `EntityManager`, and
   * a TypeORM transactional manager is a single connection. Running them
   * concurrently would interleave statements on one connection, which is a
   * driver-level bug rather than a speed-up.
   *
   * Nothing is caught. A subscriber that cannot do its job must take the
   * publisher down with it, or the transaction commits a half-built world.
   */
  async publish(event: DomainEvent, manager: EntityManager): Promise<void> {
    const handlers = this.handlers.get(event.name) ?? [];

    if (handlers.length === 0) {
      // Not an error — a fact with no listeners is still a fact — but worth
      // saying out loud, because "the snapshot never ran" and "nobody
      // subscribed" look identical from the outside.
      this.logger.warn(`${event.name} published with no subscribers`);
      return;
    }

    for (const handler of handlers) {
      await handler.handle(event, manager);
    }
  }
}
