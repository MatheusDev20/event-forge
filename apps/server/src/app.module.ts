import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule, type TypeOrmModuleOptions } from '@nestjs/typeorm';
import { validateEnv, type Env } from './config/env';
import { HealthController } from './health.controller';
import { CatalogModule } from './modules/catalog/catalog.module';
import { InventoryModule } from './modules/inventory';
import { EventsModule } from './shared/events';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Boot fails on a bad environment instead of discovering it at the first
      // query. See src/config/env.ts.
      validate: validateEnv,
    }),
    /**
     * The database is not optional. The template made it opt-in via DB_ENABLED
     * so a fresh clone could boot with no Postgres; Event-Forge is a ticketing
     * system, and one without persistence is not a degraded app — it is not an
     * app. Failing loudly at boot beats failing per-request.
     *
     * See docs/adr/0002-persistence-and-migrations.md.
     */
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): TypeOrmModuleOptions => {
        // The environment is validated at boot, so a lookup that comes back
        // empty is a programming error, not a runtime condition.
        const read = <K extends keyof Env>(key: K): Env[K] =>
          config.getOrThrow(key, { infer: true });

        return {
          type: 'postgres',
          host: read('DB_HOST'),
          port: read('DB_PORT'),
          username: read('DB_USERNAME'),
          password: read('DB_PASSWORD'),
          database: read('DB_NAME'),
          /*
           * Explicit, because the default of 10 would quietly turn the race
           * test into a measurement of driver queueing — see DB_POOL_SIZE in
           * src/config/env.ts, and the warning it comes from in
           * docs/roadmap.md.
           */
          poolSize: read('DB_POOL_SIZE'),
          // Each module registers its own entities with forFeature; this picks
          // them up without a glob over build output.
          autoLoadEntities: true,
          synchronize: false,
          logging: read('NODE_ENV') === 'development',
        };
      },
    }),
    /*
     * Read from the environment, and switchable off with THROTTLE_LIMIT=0.
     *
     * The guard and the experiment want opposite things: it exists to stop one
     * client sending hundreds of requests a minute, which is precisely what
     * firing N simultaneous holds is. A fixed limit here turns the race's
     * losers into 429s, and a rate limiter doing its job would read as a
     * passing test — see test/hold-race.e2e-spec.ts.
     */
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const limit = config.getOrThrow('THROTTLE_LIMIT', { infer: true });

        return {
          throttlers: [
            {
              ttl: config.getOrThrow('THROTTLE_TTL_MS', { infer: true }),
              // The guard has no "off" switch, so an unreachable ceiling is
              // the off switch. Infinity is not serialisable into its storage.
              limit: limit === 0 ? Number.MAX_SAFE_INTEGER : limit,
            },
          ],
        };
      },
    }),
    CacheModule.register(),
    // Global, and registered before the contexts that use it: Inventory
    // subscribes to the bus in its own onModuleInit.
    EventsModule,
    CatalogModule,
    InventoryModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
