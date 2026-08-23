const path = require('node:path');
const esbuild = require('esbuild');

/**
 * Bundles the Lambda entry point into a single CommonJS file.
 *
 * IMPORTANT: the input is `dist/lambda.js` — the output of `nest build` (tsc) —
 * not `src/lambda.ts`. esbuild does not implement `emitDecoratorMetadata`, so
 * bundling the TypeScript sources directly would drop the `design:paramtypes`
 * metadata that Nest's DI container relies on, and the Lambda would fail at
 * runtime while building fine. Letting tsc emit first and bundling the
 * resulting JS keeps the metadata intact.
 */
const OUT_DIR = path.resolve(__dirname, 'dist-lambda');
const ENTRY = path.resolve(__dirname, 'dist/lambda.js');

/**
 * Optional dependencies that Nest/TypeORM `require()` lazily. They are only
 * pulled in when the corresponding feature is used, so they must not be
 * bundled — otherwise esbuild fails on modules that were never installed.
 */
const external = [
  // Nest optional feature modules
  '@nestjs/microservices',
  '@nestjs/microservices/microservices-module',
  '@nestjs/websockets',
  '@nestjs/websockets/socket-module',
  '@nestjs/platform-socket.io',
  '@fastify/*',
  'class-transformer/storage',
  // TypeORM drivers other than pg (pg IS bundled — it is a real dependency)
  'mysql',
  'mysql2',
  'sqlite3',
  'better-sqlite3',
  'mssql',
  'oracledb',
  'mongodb',
  'redis',
  'ioredis',
  'sql.js',
  '@sap/hana-client',
  'hdb-pool',
  'pg-native',
  'pg-query-stream',
  'typeorm-aurora-data-api-driver',
  '@google-cloud/spanner',
  'react-native-sqlite-storage',
  // Provided by the Lambda runtime image
  '@aws-sdk/*',
];

async function main() {
  const result = await esbuild.build({
    entryPoints: [ENTRY],
    outfile: path.join(OUT_DIR, 'index.js'),
    bundle: true,
    platform: 'node',
    // Match the AWS Lambda Node.js runtime.
    target: 'node22',
    format: 'cjs',
    sourcemap: false,
    minify: false,
    external,
    logLevel: 'info',
    // metafile lets us report the bundle size below.
    metafile: true,
  });

  const bytes = Object.values(result.metafile.outputs).reduce(
    (total, output) => total + output.bytes,
    0,
  );
  console.log(
    `✅ Bundle written to dist-lambda/index.js (${(bytes / 1024 / 1024).toFixed(2)} MB)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
