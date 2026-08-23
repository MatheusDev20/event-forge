import {
  BadRequestException,
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';
import { ERROR_CODES } from '@repo/contracts/shared';
import type { ZodType } from 'zod';

/**
 * Validates and *transforms* an argument against a contract schema. What comes
 * out is the parsed value — defaults applied, numeric strings coerced — so a
 * handler never sees a raw query string.
 *
 * Bound per argument rather than globally: a global pipe has to guess which
 * schema applies to which parameter, and that guess is where the contract stops
 * being the source of truth.
 */
@Injectable()
export class ZodValidationPipe<TOutput> implements PipeTransform {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: unknown, metadata: ArgumentMetadata): TOutput {
    const result = this.schema.safeParse(value);

    if (result.success) return result.data;

    throw new BadRequestException({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: `Invalid ${metadata.type}`,
      details: result.error.issues.map((issue) => ({
        path: issue.path.join('.') || metadata.data || String(metadata.type),
        message: issue.message,
      })),
    });
  }
}
