import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ERROR_CODES, type ApiError } from '@repo/contracts/shared';
import type { Request, Response } from 'express';

/** Plain number so comparisons against ApiError.statusCode stay number-to-number. */
const SERVER_ERROR_THRESHOLD: number = HttpStatus.INTERNAL_SERVER_ERROR;

const STATUS_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: ERROR_CODES.VALIDATION_FAILED,
  [HttpStatus.NOT_FOUND]: ERROR_CODES.NOT_FOUND,
  [HttpStatus.CONFLICT]: ERROR_CODES.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: ERROR_CODES.RATE_LIMITED,
};

/**
 * Every failure leaves the API in the one shape `apiErrorSchema` describes.
 * Catching everything (not just HttpException) is what makes that promise true:
 * an unhandled throw would otherwise escape as Express's HTML error page.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const error = this.toApiError(exception, request.url);

    if (error.statusCode >= SERVER_ERROR_THRESHOLD) {
      // The client gets a generic message; the detail stays in our logs.
      this.logger.error(
        `${request.method} ${request.url} failed`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(error.statusCode).json(error);
  }

  private toApiError(exception: unknown, path: string): ApiError {
    const timestamp = new Date().toISOString();

    if (!(exception instanceof HttpException)) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: ERROR_CODES.INTERNAL,
        message: 'Internal server error',
        path,
        timestamp,
      };
    }

    const statusCode = exception.getStatus();
    const body = exception.getResponse();
    const fallbackCode = STATUS_CODES[statusCode] ?? ERROR_CODES.INTERNAL;

    if (typeof body === 'string') {
      return { statusCode, code: fallbackCode, message: body, path, timestamp };
    }

    const shape = body as {
      code?: string;
      message?: string | string[];
      details?: ApiError['details'];
    };

    return {
      statusCode,
      code: shape.code ?? fallbackCode,
      message: Array.isArray(shape.message)
        ? shape.message.join('; ')
        : (shape.message ?? exception.message),
      details: shape.details,
      path,
      timestamp,
    };
  }
}
