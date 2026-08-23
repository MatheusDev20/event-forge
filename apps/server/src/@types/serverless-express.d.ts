/**
 * `@codegenie/serverless-express` v5 ships no type declarations, so we declare
 * the slice of its API that this project uses.
 *
 * Runtime shape (see node_modules/@codegenie/serverless-express/src/index.js):
 *   module.exports = configure
 *   module.exports.getCurrentInvoke = getCurrentInvoke
 *   module.exports.configure = configure
 */
declare module '@codegenie/serverless-express' {
  import type { Handler } from 'aws-lambda';

  interface BinarySettings {
    contentTypes?: string[];
    contentEncodings?: string[];
    isBinary?: (args: { headers: Record<string, string> }) => boolean;
  }

  interface ConfigureOptions {
    app: unknown;
    binarySettings?: BinarySettings;
    eventSourceName?: string;
    eventSourceRoutes?: Record<string, string>;
    respondWithErrors?: boolean;
    logSettings?: { level?: string };
  }

  function configure(options: ConfigureOptions): Handler;

  namespace configure {
    function getCurrentInvoke(): { event: unknown; context: unknown };
    function configure(options: ConfigureOptions): Handler;
  }

  export = configure;
}
