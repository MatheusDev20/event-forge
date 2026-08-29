import { Global, Module } from '@nestjs/common';
import { DomainEventBus } from './domain-event-bus';

/**
 * The bus, once, for everyone.
 *
 * Global because subscription is the point: every context that publishes or
 * listens needs the same instance, and threading an import through each of
 * them would add ceremony without adding a boundary. The boundary that matters
 * — who may know about whom — is enforced by the import rules in
 * eslint.config.mjs, not by which module imported the bus.
 */
@Global()
@Module({
  providers: [DomainEventBus],
  exports: [DomainEventBus],
})
export class EventsModule {}
