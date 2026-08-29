import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Env } from '../../config/env';
import { EventsController } from './api/events.controller';
import { CatalogService } from './application/catalog.service';
import { EventEntity } from './infrastructure/entities/event.entity';
import { OrganizerEntity } from './infrastructure/entities/organizer.entity';
import { PriceTierEntity } from './infrastructure/entities/price-tier.entity';
import { PriceTierSectionEntity } from './infrastructure/entities/price-tier-section.entity';
import { SeatEntity } from './infrastructure/entities/seat.entity';
import { SeatMapEntity } from './infrastructure/entities/seat-map.entity';
import { SeatRowEntity } from './infrastructure/entities/seat-row.entity';
import { SectionEntity } from './infrastructure/entities/section.entity';
import { VenueEntity } from './infrastructure/entities/venue.entity';
import { EventsRepository } from './infrastructure/events.repository';
import { HeroImageStorage } from './infrastructure/hero-image.storage';
import { LocalHeroImageStorage } from './infrastructure/local-hero-image.storage';
import { S3HeroImageStorage } from './infrastructure/s3/event-hero/s3-hero-image.storage';

/**
 * Which storage backend hero image uploads use, decided once at boot.
 *
 * A factory rather than two conditionally-registered providers because the
 * choice is a value, not a shape: everything that injects `HeroImageStorage`
 * gets the port either way and cannot tell which adapter answered. `env.ts`
 * has already refused to boot if `S3_UPLOAD` is on without a bucket and a
 * region, so by the time this runs there is nothing left to validate.
 *
 * It is logged because "images stopped appearing after the deploy" is a
 * question whose answer is this line, and reading it out of the environment
 * after the fact is guesswork.
 */
const heroImageStorageProvider = {
  provide: HeroImageStorage,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): HeroImageStorage => {
    if (config.get('S3_UPLOAD', { infer: true })) {
      new Logger(CatalogModule.name).log(
        `Hero images: S3 bucket "${config.get('S3_BUCKET', { infer: true })}"`,
      );

      return new S3HeroImageStorage(config);
    }

    new Logger(CatalogModule.name).log(
      `Hero images: local disk "${config.get('UPLOADS_DIR', { infer: true })}"`,
    );

    return new LocalHeroImageStorage(config);
  },
};

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
      PriceTierSectionEntity,
      SeatEntity,
      SeatMapEntity,
      SeatRowEntity,
      SectionEntity,
      VenueEntity,
    ]),
  ],
  controllers: [EventsController],
  providers: [CatalogService, EventsRepository, heroImageStorageProvider],
  exports: [CatalogService],
})
export class CatalogModule {}
