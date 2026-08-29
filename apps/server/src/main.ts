import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import type { Env } from './config/env';
import { HttpExceptionFilter } from './shared/http/http-exception.filter';
import { UPLOADS_ROUTE_PREFIX } from './shared/http/static-assets';

const API_VERSION = 'v1';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService<Env, true>);

  // /health sits outside the versioned prefix so infra probes have a stable
  // path across API versions.
  app.setGlobalPrefix(`api/${API_VERSION}`, { exclude: ['health'] });

  /**
   * No global ValidationPipe: every endpoint validates against its contract
   * schema through ZodValidationPipe, bound per argument. A global pipe would
   * quietly do nothing here (there are no class DTOs to reflect over) while
   * looking like it was providing cover.
   */
  app.useGlobalFilters(new HttpExceptionFilter());

  /**
   * Uploaded images, served straight off disk.
   *
   * Mounted outside the versioned prefix (see UPLOADS_ROUTE_PREFIX) because a
   * `hero_image_url` written today is dereferenced for as long as the row
   * lives, and it should not stop resolving the day the API becomes v2.
   *
   * `express.static` is the local-first stopgap ADR-0005 allows, and the reason
   * HeroImageStorage keeps the seam narrow: the day this moves to object
   * storage, this call and that class go together and nothing else changes.
   */
  app.useStaticAssets(resolve(config.get('UPLOADS_DIR', { infer: true })), {
    prefix: `${UPLOADS_ROUTE_PREFIX}/`,
    // Filenames carry a UUID and are never reused, so a cached copy can
    // never be stale — a replacement always arrives at a different URL.
    immutable: true,
    maxAge: '30d',
    // Serve what is there, or 404. Without this, a request for a missing
    // image falls through to Nest's router and comes back as a confusing
    // "Cannot GET" rather than as a plain miss.
    fallthrough: false,
    index: false,
    // These are attacker-supplied bytes at an origin of ours. Refusing to
    // guess an executable type, and telling the browser not to guess either,
    // is what keeps a stored file from being served as script.
    setHeaders: (response) => {
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Content-Security-Policy', "default-src 'none'");
    },
  });

  app.enableCors({
    origin: config.get('WEB_ORIGIN', { infer: true }),
    credentials: true,
  });

  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  // 3001, not 3000: apps/web owns 3000 (next dev's default) and both run under
  // `turbo dev`, so sharing a default port makes one of them die on EADDRINUSE.
  await app.listen(port);

  new Logger('Bootstrap').log(`API listening on http://localhost:${port}`);
}

void bootstrap();
