# ADR-0007: Pessimistic row locking as the hold baseline

- **Status:** Accepted
- **Date:** 2026-09-04

## Context

ADR-0006 gave Inventory something scarce: `allocations`, one row per seat and
one counter row per general-admission section, with
`held + reserved <= capacity` as a CHECK constraint. Nothing yet claimed any of
it, so no two requests in this system could conflict.

The roadmap's experiment is one sentence: *N attendees request the same seat at
the same instant; exactly one gets it, and we can say which mechanism made that
true.* Three mechanisms are on the table and they are genuinely different
answers, not variations:

- **Pessimistic** — `SELECT … FOR UPDATE`, blocking the losers until the winner
  commits.
- **Optimistic** — a version column and a retry loop, letting the losers do the
  work twice rather than wait.
- **Serializable** — `SERIALIZABLE` isolation and a retry on `40001`, letting
  Postgres detect the conflict rather than describing it in application code.

Comparing them is Slice 3. But a comparison needs a baseline, and a baseline
has to be a thing that exists and works. Picking all three at once would mean
three untested implementations and no way to tell a strategy's cost from a
bug's.

There is also a decision hiding inside "exactly one gets it": *what enforces
it?* An application-level lock is a promise made by code, and code can be
wrong. The invariant has to survive the strategy being broken, or the
experiment cannot distinguish "the lock worked" from "we got lucky".

## Decision

**One strategy, pessimistic, as the baseline — with the database as the
backstop underneath it.**

Placing a hold is one transaction that does four things in this order:

1. Reads the event's status. Only an `on_sale` event accepts holds.
2. `SELECT … WHERE id = ANY($1) ORDER BY id FOR UPDATE` over the named
   allocations. **The `ORDER BY` is part of the decision, not a detail**: two
   claims naming the same seats in opposite orders would otherwise each hold
   what the other wants, and Postgres would break the tie by killing one with a
   deadlock error that is indistinguishable, from outside, from losing a seat.
   A total order over ids, shared by every request, makes that impossible
   rather than rare.
3. Judges the locked rows with a pure function (`refuseHold`). It knows nothing
   about locks; what makes its answer trustworthy is only that the rows it was
   handed are already locked.
4. Moves the units, then records the hold and its lines.

And underneath all four, `allocations_no_oversell_check` remains the actual
authority. If every line of reasoning above is wrong, the constraint refuses
the write. A broken strategy cannot oversell; it can only fail loudly.

Two supporting decisions come with it, because without them the experiment
measures something other than what it claims:

- **The connection pool is configured, not inherited.** TypeORM defaults to 10.
  Firing 16 concurrent holds at a pool of 10 means six of them queue in the
  driver and never contend at all — the test would pass while measuring driver
  scheduling. `DB_POOL_SIZE` is explicit, and the race test asserts it exceeds
  the concurrency it fires.
- **The rate limiter is configurable and off for the experiment.**
  `ThrottlerGuard` exists to refuse exactly the traffic shape a race produces:
  many requests from one client in a moment. Left at a fixed 60/minute, the
  race's losers come back as `429`s — a rate limiter working correctly, read as
  a locking strategy working correctly. `THROTTLE_LIMIT=0` disables it.

Failures are distinguished by code rather than status. `ALLOCATION_UNAVAILABLE`
means *someone else got there first*; `EVENT_NOT_ON_SALE` means the doors are
shut; a malformed claim is a `400`. Collapsing them into one `409` would let a
broken client and a dropped connection count as well-behaved losers.

## Consequences

**Easier.** There is a working baseline to compare against, and the comparison
in Slice 3 is a change of one file — `holds.repository.ts` holds the entire
locking decision in two SQL constants. The `version` column ADR-0006 added is
already populated, so the optimistic strategy needs no migration. The failure
taxonomy means a race test can assert on *why* each loser lost, which is what
makes a broken lock show up red instead of green.

**Harder.** Pessimistic locking serialises contention: N claimants for one seat
means N−1 requests waiting on a row lock, each holding a pooled connection
while they wait. That is fine at the scale this runs at and it is precisely the
cost Slice 3 is meant to measure — but it means pool size and lock duration are
now coupled, and a slow query inside the transaction is a queue everywhere.

**Accepted costs.**

- The `on_sale` check happens *before* the transaction opens, so an event
  closed in that window still accepts one last hold. Closing an event is not
  something thousands of requests do per second, and holding a row lock across
  a Catalog read would be a worse trade.
- **Hold expiry is written and not enforced.** `expires_at` is set on every
  hold; nothing sweeps it and no read discounts it, so an expired hold keeps
  its units off sale indefinitely. This is a known gap, deliberately deferred:
  expiry is a different experiment (read-time enforcement, sweepers,
  controllable time) and needs an injectable clock to be testable at all. The
  column and its partial index exist now so that work is a change of behaviour
  rather than a migration.
- Anyone may place a hold for anyone. Authorization is Slice 4; the race does
  not need to know who is racing.

## Alternatives considered

**All three strategies at once.** The comparison is the point of Slice 3, so
building all three now looks like a shortcut. It is the opposite: three
untested implementations with no baseline means the first surprising number is
unattributable — a strategy's cost and an implementation's bug look identical.

**Optimistic first.** Tempting, because it needs no lock and the version column
already exists. Rejected as a *baseline* specifically: its behaviour under
contention is a retry storm whose shape depends on the retry policy, so the
first thing measured would be a tuning parameter rather than the database.
Pessimistic has one behaviour and no knobs, which is what a baseline should be.

**A unique constraint or an advisory lock instead of `FOR UPDATE`.** Both work
for a seat and neither generalises to the general-admission counter, where the
question is "are there four left" rather than "is this taken". ADR-0006 went to
some trouble to make both shapes one table with one invariant; a strategy that
only handles half of them would give that up on the first slice that used it.
The sharded-counter and advisory-lock approaches remain on the table for Slice
3, where the hot GA row gets implementations of its own.

**Enforcing the invariant only in application code.** Rejected outright, and it
is the reason this ADR exists at all. The whole experiment turns on being able
to tell a working lock from a lucky one, and a system where the only guard is
the code under test cannot make that distinction. With the CHECK constraint
present, removing `FOR UPDATE` makes the race test fail — verified, not
assumed — and it fails on the losers' *reason* rather than on an oversell,
because the database refused the write the broken strategy tried to make.
