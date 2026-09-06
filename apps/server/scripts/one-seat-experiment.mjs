/**
 * OneSeatExperiment, by hand and out loud.
 *
 * The e2e spec (`test/hold-race.e2e-spec.ts`) is the proof: it boots its own
 * app, fires 16 claims 50 rounds over and asserts. This is the other thing —
 * the same race against a *running* server, narrated line by line, so the
 * interleaving is something you watch rather than something you take on trust.
 *
 * It is not a replacement for the spec and it asserts nothing. Read it as an
 * instrument, not as evidence.
 *
 *   node scripts/one-seat-experiment.mjs                 # 8 claims, one seat
 *   node scripts/one-seat-experiment.mjs --racers 24     # more than the pool
 *   node scripts/one-seat-experiment.mjs --ga            # race the GA counter
 *
 * Requires `pnpm dev` running and `pnpm db:fresh:simple` already applied.
 */

const API = process.env.API ?? 'http://localhost:3001/api/v1';

/** The fixed id `db:seed:simple` writes. Override for any other event. */
const SEEDED_EVENT = '77777777-7777-4777-8777-777777777777';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};

const EVENT = flag('event', SEEDED_EVENT);
const RACERS = Number(flag('racers', 8));
const GA = args.includes('--ga');

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

let t0 = Date.now();
/** Milliseconds since the starting gun. The only clock that matters here. */
const elapsed = () => dim(`+${String(Date.now() - t0).padStart(4)}ms`);

async function call(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Every endpoint answers JSON, including the failures — that is the whole
  // point of HttpExceptionFilter, and it means one parse covers both paths.
  return {
    status: response.status,
    body: await response.json().catch(() => null),
  };
}

/**
 * Publish and open the doors, tolerating "already".
 *
 * Both endpoints refuse a repeat with a 409, which on a re-run is the correct
 * answer to a question we only asked to be sure — so it is reported and
 * stepped over rather than treated as a failure.
 */
async function openTheDoors() {
  for (const step of ['publish', 'on-sale']) {
    const { status, body } = await call('POST', `/events/${EVENT}/${step}`);
    const detail = status < 400 ? body.status : dim(body?.message ?? '');
    console.log(
      `  ${step.padEnd(8)} ${status < 400 ? green(status) : yellow(status)}  ${detail}`,
    );
  }
}

/** A seat with room, or the GA counter — whichever is being raced. */
async function pickTarget() {
  const { status, body } = await call(
    'GET',
    `/events/${EVENT}/availability?pageSize=48`,
  );

  if (status !== 200) {
    console.error(red(`availability -> ${status}`), body);
    process.exit(1);
  }

  const wanted = GA ? 'general_admission' : 'seated';
  const open = body.items.filter(
    (item) => item.kind === wanted && item.available > 0,
  );

  // The tightest counter, so "more claimants than units" is the default and
  // the sell-out boundary is something the run actually reaches. A seat is a
  // seat; any one with room will do.
  const target = GA
    ? open.sort((a, b) => a.available - b.available)[0]
    : open[0];

  if (!target) {
    console.error(
      red(
        `No ${wanted} allocation with units left. Re-run: pnpm db:fresh:simple`,
      ),
    );
    process.exit(1);
  }

  return target;
}

/** One claimant. Logs when it leaves and what it came back with. */
async function race(n, allocationId) {
  const me = `racer ${String(n).padStart(2, '0')}`;

  console.log(
    `${elapsed()} ${dim('→')} ${me} trying to allocate ${dim(allocationId)}`,
  );

  const { status, body } = await call('POST', `/events/${EVENT}/holds`, {
    lines: [{ allocationId, quantity: 1 }],
  });

  // The reason is the whole point. "Not a 201" also covers a dropped
  // connection, a deadlock and a 500 — and a race test that counts only
  // statuses would read any of those as a well-behaved loser.
  const note =
    status === 201
      ? green(`201 WON     hold ${body.id}`)
      : status === 409
        ? yellow(`409 lost    ${body.code}`)
        : red(`${status} ???     ${body?.code ?? ''} ${body?.message ?? ''}`);

  console.log(`${elapsed()} ${dim('←')} ${me} ${note}`);

  return { status, code: body?.code };
}

async function main() {
  console.log(bold(`\nOneSeatExperiment  ${dim(API)}\n`));

  console.log(bold('1. Open the doors'));
  await openTheDoors();

  console.log(bold('\n2. Pick the contended row'));
  const target = await pickTarget();
  const label = GA
    ? `${target.sectionName} (counter, ${target.available}/${target.capacity} free)`
    : `${target.sectionName} row ${target.rowLabel} seat ${target.seatLabel}`;
  console.log(`  ${label}\n  ${dim(target.id)}`);

  console.log(bold(`\n3. Fire ${RACERS} claims at it, at once`));

  // Started together and awaited together: no `await` inside the map, or they
  // would queue and there would be nothing to race.
  t0 = Date.now();
  const outcomes = await Promise.all(
    Array.from({ length: RACERS }, (_, i) => race(i + 1, target.id)),
  );

  console.log(bold('\n4. Tally'));
  const tally = new Map();
  for (const { status, code } of outcomes) {
    const key = `${status}${code ? ` ${code}` : ''}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  for (const [key, count] of [...tally].sort()) {
    console.log(`  ${String(count).padStart(3)} × ${key}`);
  }

  console.log(bold('\n5. What the table says now'));
  const after = await call('GET', `/events/${EVENT}/availability?pageSize=48`);
  const row = after.body.items.find((item) => item.id === target.id);
  console.log(`  available ${row.available} of ${row.capacity}\n`);

  const winners = outcomes.filter((o) => o.status === 201).length;
  const expected = GA ? Math.min(RACERS, target.available) : 1;
  console.log(
    winners === expected
      ? green(`${winners} winner(s), which is exactly the units on offer.\n`)
      : red(
          `${winners} winner(s), expected ${expected}. That is the interesting case.\n`,
        ),
  );
}

main().catch((error) => {
  console.error(red('\nFailed. Is `pnpm dev` running?\n'), error.message);
  process.exit(1);
});
