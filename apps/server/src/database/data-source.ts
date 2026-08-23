import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { join } from 'node:path';
import { EventEntity } from '../modules/catalog/infrastructure/entities/event.entity';
import { OrganizerEntity } from '../modules/catalog/infrastructure/entities/organizer.entity';
import { PriceTierEntity } from '../modules/catalog/infrastructure/entities/price-tier.entity';
import { VenueEntity } from '../modules/catalog/infrastructure/entities/venue.entity';

loadDotenv({ path: join(__dirname, '..', '..', '.env'), quiet: true });

/**
 * Entities are listed explicitly rather than globbed. A glob depends on build
 * output layout and silently finds nothing when that layout changes; this list
 * is a compile error when an entity moves.
 *
 * Every module that owns entities registers them again with
 * TypeOrmModule.forFeature — this list exists for the migration CLI, which
 * boots without Nest.
 */
export const entities = [
  EventEntity,
  OrganizerEntity,
  PriceTierEntity,
  VenueEntity,
];

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5433),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'postgres',
  entities,
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  // Never true. Schema changes go through reviewed migrations — see
  // docs/adr/0002-persistence-and-migrations.md.
  synchronize: false,
};

/** Default export is what the TypeORM CLI looks for. */
export default new DataSource(dataSourceOptions);
