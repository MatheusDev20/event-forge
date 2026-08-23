import { Injectable, Logger } from '@nestjs/common';

/**
 * Extension point for app-specific logging. Extends the Nest logger so it can
 * be injected anywhere via LoggerModule; add domain log helpers as needed.
 */
@Injectable()
export class CustomLogger extends Logger {}
