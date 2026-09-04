import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Environment overrides for e2e runs, applied before any test module loads.
 *
 * This has to be a `setupFiles` entry and not a `beforeAll`: `AppModule` calls
 * `ConfigModule.forRoot()` while it is being *imported*, so by the time any
 * hook runs the environment has already been read and validated. Jest loads
 * this file first, which is the only point early enough.
 *
 * The uploads and the rate limiter are overridden. Everything else — the
 * database above all — stays exactly as `.env` and CI configure it, because
 * e2e tests are supposed to run against the real thing.
 */

/**
 * Off, and this one is not a convenience.
 *
 * The hold race fires N simultaneous requests from one client, dozens of times
 * — which is the exact traffic shape ThrottlerGuard exists to refuse. Left on,
 * the race's losers come back as 429s and the suite would report a rate
 * limiter doing its job as a locking strategy doing its job. Every refusal in
 * these tests has to come from the domain, so nothing may stand in front of it.
 *
 * Slice 3's load harness will need the same, for the same reason.
 */
process.env.THROTTLE_LIMIT = '0';

/**
 * Per-process so parallel Jest workers cannot delete each other's files. Not
 * created here: `HeroImageStorage` makes it on first write, and a suite that
 * uploads nothing should not leave an empty directory behind in /tmp.
 */
process.env.UPLOADS_DIR = join(tmpdir(), `event-forge-uploads-${process.pid}`);

/**
 * Deliberately not the port anything listens on. Stored URLs are built from
 * this, and a test asserting on one should be reading a value the suite chose
 * rather than one that happens to match a running dev server.
 */
process.env.PUBLIC_BASE_URL = 'http://127.0.0.1:9999';
