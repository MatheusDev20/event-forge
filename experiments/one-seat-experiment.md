# OneSeatExperiment

> Two attendees request **the same seat**, for the same event, at the same
> instant, moments after it went on sale. **Exactly one gets it.**

Status: **green**. Baseline strategy is pessimistic locking —
`SELECT … FOR UPDATE` on the allocation rows.

## The setup

`pnpm db:fresh:simple` builds the smallest database that can answer this: one
venue, one layout, one row of four seats, and a ten-unit general-admission
counter. Both kinds are present because they contend differently — four seats
are four rows locked one at a time, the counter is a single hot row every
claim serialises on.

## Run it by hand

The seed prints the whole walk-through. Short version, after `pnpm dev`:

```bash
# publish (Inventory snapshots the layout), then open the doors
curl -s -X POST localhost:3001/api/v1/events/$E/publish  | jq '.status'
curl -s -X POST localhost:3001/api/v1/events/$E/on-sale  | jq '.status'

# grab an allocation id, then fire 8 claims at it at once
seq 8 | xargs -P8 -I@ curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST localhost:3001/api/v1/events/$E/holds \
  -H 'content-type: application/json' \
  -d '{"lines":[{"allocationId":"'$A'","quantity":1}]}' | sort | uniq -c
```

```
   1 201
   7 409
```

## Run it for real

```bash
pnpm --filter @repo/server test:e2e
```

`test/hold-race.e2e-spec.ts` fires **16 simultaneous claims at one seat, 50
rounds over**, and asserts exactly one `201` and exactly 15 `409`s — each one
carrying `ALLOCATION_UNAVAILABLE` rather than merely failing. Afterwards the
seat is held by exactly one holder, named, in the database.

## Why the green means anything

It was checked against a deliberately broken strategy: with `FOR UPDATE`
removed, the test fails. Note *how* it fails — not with an oversell, because
`allocations_no_oversell_check` still refuses that write, but with losers
failing for the wrong reason. The constraint makes the bug impossible and the
assertions make it visible.

## Four things that silently invalidate this test

1. **Pool size must exceed N.** TypeORM defaults to 10. Fire 200 concurrent
   holds and 190 queue in the pool before reaching Postgres — you would be
   measuring pool queueing and drawing conclusions about locks.
2. **Loop it.** Interleavings are sampled, not enumerated. A race that passes
   once proves nothing, and a flaky pass is a failure.
3. **Assert the losers' reason.** N−1 requests failing is not the same as N−1
   requests failing *because the seat was taken*. A dropped connection counts
   as a loss and would hide a broken lock.
4. **The rate limiter counts too.** `ThrottlerGuard` at 60/minute turns the
   losers into `429`s — a guard doing its job, read as a lock doing its job.

## Next

Comparison. One strategy is a baseline, not a finding — pessimistic against
optimistic (version column) against an advisory-lock variant, same harness,
one graph. See [`docs/roadmap.md`](../docs/roadmap.md).

Details: [ADR-0007](../docs/adr/0007-pessimistic-locking-baseline.md).
