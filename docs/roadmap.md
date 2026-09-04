# Roadmap — one experiment

_Last updated: 2026-09-04_

## The experiment

> Two attendees request **the same seat**, for the same event, at the same
> instant, moments after it went on sale. **Exactly one gets it.**
>
> Prove it under real concurrency, repeatedly, in CI — and be able to explain
> *which mechanism* made it true.

That is the whole point of this project. Everything below is judged by one
question: does it get closer to that sentence being demonstrably true?

Event-Forge is a lab, not a product. So the old definition of done — "you can
use it in a browser" — does not apply here. **A slice is done when a test
proves something about the system's behaviour under contention.** A browser
cannot demonstrate a race; a test that fires N simultaneous requests and counts
the winners can.

## Where we are

**Slices 0, 1 and 2 are done. The experiment runs, and it is green.**

`test/hold-race.e2e-spec.ts` fires 16 simultaneous claims at one seat, 50 times
over, and asserts exactly one `201` and exactly 15 `409`s — every one of them
carrying `ALLOCATION_UNAVAILABLE` rather than merely failing. Afterwards the
seat is held by exactly one holder, named, in the database.

It has been checked against a broken strategy, which is the only way to know a
green run means anything: with `FOR UPDATE` removed from the locking query, the
test fails. Note *how* it fails — not with an oversell, because
`allocations_no_oversell_check` still refuses that write, but with losers
failing for the wrong reason. That is the design working as intended: the
constraint makes the bug impossible and the assertions make it visible.

Two things the slice discovered, both now written down in
`docs/adr/0007-pessimistic-locking-baseline.md`:

- The **rate limiter** and the experiment want opposite things. `ThrottlerGuard`
  at a fixed 60/minute turns the race's losers into `429`s — a guard doing its
  job, read as a lock doing its job. It is configurable now, and off for the
  race.
- **Supertest binds a port per request** when handed a server that is not
  listening. Sixteen concurrent calls each try to bind, and the resulting
  `ECONNRESET` is indistinguishable from a request the API dropped. The race
  suite calls `listen(0)` once, up front.

**What is missing is comparison.** There is one strategy and one shape of
contention worth measuring at any scale. 824 seats across the whole database
is not enough to make anything queue, and no numbers have been recorded.

---

## Slice 1 — Inventory, and the snapshot that creates scarcity ✅

You cannot race for a seat until a seat is a thing that can be *claimed*. This
slice turns Catalog's layout into Inventory's claimable units.

The design decision is already made — see `docs/adr/0006-seat-map-snapshot.md`.
This slice is its implementation, and `catalog.service.ts` already carries the
comment marking exactly where it hooks in.

**What it forces:**

- An `inventory` module with an `allocations` table: one row per seat for
  seated sections, one counter row per general-admission section.
- `EventPublished` becomes a real in-process domain event with a real
  subscriber. It was named in the domain model before anything emitted it; this
  is what stops the bus being decorative.
- Publishing becomes **one transaction**: the status `UPDATE` and the snapshot
  of thousands of allocation rows commit together, or neither does.
- The `published → on_sale` transition. `docs/domain-model.md` is binding, and
  it says only an `on_sale` event accepts holds. It is the same conditional-
  `UPDATE` shape as publish, so it costs little — and it keeps "visible" and
  "sellable" as separate facts, which matters the moment you want an event
  sitting ready before you open the doors on it.

**Done when:** publishing a 200-seat event creates exactly 200 allocation rows
in the same transaction, and a forced failure mid-snapshot leaves the event a
draft with zero allocations.

**Done.** `test/publish-snapshot.e2e-spec.ts`. The `published → on_sale`
transition landed with it.

---

## Slice 2 — The hold, and the race ★ ✅

**This is the experiment.** Everything before it is setup; everything after it
is variation.

**What it forces:**

- `POST /api/v1/events/:id/holds` taking seat ids — `201` with the hold, or
  `409` because someone else got there first. A holder is an opaque id for now;
  authorization is deferred and anonymous claims are enough to race.
- One locking strategy, chosen and understood: pessimistic
  `SELECT ... FOR UPDATE` on the allocation rows. One, not three — comparing
  strategies is the next slice, and you cannot compare against a baseline you
  have not built.
- **The flagship test.** N simultaneous requests for one seat; assert exactly
  one `201` and exactly N−1 `409`. Asserted on the counts, never on the happy
  path.
- The invariant test: `held + reserved ≤ capacity` after any interleaving.

**Three things that will silently invalidate this test, so build them in:**

1. **The connection pool must exceed N.** TypeORM defaults to 10. Fire 200
   concurrent holds against it and 190 queue in the pool before ever reaching
   Postgres — you would be measuring pool queueing and concluding things about
   locks. Set it explicitly, and treat it as a knob you vary on purpose.
2. **Run the race in a loop, ~50 times.** A race that passes once proves
   nothing; interleavings are sampled, not enumerated. A flaky pass is a
   failure.
3. **Assert the losers' reason.** N−1 requests failing is not the same as N−1
   requests failing *because the seat was taken*. A connection error counts as
   a loss and would hide a broken lock.

**Done when:** `pnpm test:e2e` runs the race 50 times in CI, green every time,
and the seat is held by exactly one holder in the database afterwards.

**Done.** `test/hold-race.e2e-spec.ts`, and it covers more than the seated
race: the general-admission counter sells down to exactly its capacity and no
further, a multi-seat claim is all-or-nothing, and opposed lock orders do not
deadlock. `POST /api/v1/events/:id/holds` is the endpoint;
`GET /api/v1/events/:id/availability` came with it, because a client has to
learn an allocation id from somewhere and reaching into the database is not an
API.

One addition to the three guards above, learnt the hard way: **the rate limiter
counts as a fourth.** See "Where we are".

---

## Slice 3 — Three strategies, one graph

Only now is comparison meaningful, because there is a working baseline to
compare against.

- **Pessimistic** — `SELECT ... FOR UPDATE` (the Slice 2 baseline).
- **Optimistic** — a version column, and a retry loop on the lost update.
- **Serializable** — `SERIALIZABLE` isolation with a retry on `40001`. The
  third strategy, and the one most people never try; Postgres defaults to READ
  COMMITTED and the difference deserves its own ADR.

**What it forces:**

- A load harness (k6 — scenarios are code, thresholds fail the run).
- A scale seeder: one stadium, ~50k seats. 824 seats across the whole database
  today is not enough to make anything contend.
- p50/p95/p99, throughput, retry counts, and pool saturation. You cannot reason
  about contention you cannot see.
- `docs/experiments/`, one committed file per run: setup, numbers, conclusion.
  A lab whose results live in terminal scrollback is a demo.

**Then the interesting half.** Seated booking spreads contention across
thousands of rows. **General admission is a single hot row** — the genuinely
hard shape, and the one worth three implementations of its own:
`UPDATE ... WHERE available >= n`, an advisory lock, and a sharded counter
(contention ÷ N, at the cost of a harder "is the last one gone?" read).

**Done when:** a committed experiment file states which strategy wins at which
contention level, with numbers behind it.

---

## Not now

Cut deliberately, so the experiment stays in focus. These keep their original
numbers because code comments point at them.

- **Hold expiry.** A *different* experiment — read-time enforcement, sweepers,
  controllable time. Genuinely interesting, and it needs an injectable clock
  before it is testable at all. It comes after the race is proven, not before.
- **Slice 4 — Identity and authorization.** The race does not need to know who
  is racing.
- **Slice 5 — Organizer console.** Events are created over HTTP and seeded;
  that is enough to publish one and race for its seats.
- **Checkout, payments, the saga.** A hold is a sufficient claim to prove
  exclusivity. Money adds a workflow, not concurrency.
- **Notifications.** Nothing here needs telling.
- **Seat map rendering in the browser.** The proof of this project is a test,
  not a picture.
