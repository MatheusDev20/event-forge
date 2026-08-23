import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import type { Env } from './config/env';
import { HttpExceptionFilter } from './shared/http/http-exception.filter';

const API_VERSION = 'v1';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
