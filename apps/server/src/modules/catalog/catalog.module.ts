import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsController } from './api/events.controller';
import { CatalogService } from './application/catalog.service';
import { EventEntity } from './infrastructure/entities/event.entity';
import { OrganizerEntity } from './infrastructure/entities/organizer.entity';
import { PriceTierEntity } from './infrastructure/entities/price-tier.entity';
import { VenueEntity } from './infrastructure/entities/venue.entity';
import { EventsRepository } from './infrastructure/events.repository';

/**
 * The Catalog bounded context.
 *
 * `exports` is the module's entire public surface: other contexts may inject
 * CatalogService and nothing else. Entities and repositories stay internal,
 * and the import-boundary lint rule enforces that (see eslint.config.mjs).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      EventEntity,
      OrganizerEntity,
      PriceTierEntity,
      VenueEntity,
    ]),
  ],
  controllers: [EventsController],
  providers: [CatalogService, EventsRepository],
  exports: [CatalogService],
})
export class CatalogModule {}
