# Roadmap — vertical slices

_Last updated: 2026-08-22_

Every slice crosses the whole stack: design system → web → contract → domain →
database → test. Nothing is "the backend half of a feature". A slice is done
when you can use it in a browser and its tests run in CI.

## Slice 0 — Walking skeleton: browse & view events

Deliberately trivial domain logic. The point is to prove the architecture end to
end while there is nothing complicated to hide behind.

**Groundwork it forces:**

- `packages/contracts` exists, with `catalog` schemas (ADR-0003).
- `@repo/ui` has a token layer, light + dark, and its first real components
  (ADR-0004); daisyUI is gone.
- `apps/server` has its first bounded-context module with enforced import
  boundaries and a lint rule that fails the build (ADR-0001).
- Migrations run, `synchronize` is off, `DB_ENABLED` is gone (ADR-0002).
- Seed data: a handful of venues, organizers, and published events.
- CI green: lint, typecheck, unit, e2e against Postgres.

**Fixes to fold in while touching these files:** `main.ts` calls
`useGlobalPipes` twice; `PostgresDBConfigService.createTypeOrmOptions` catches
its own error and returns `undefined`, turning a bad config into a confusing
downstream crash instead of a clear boot failure.

**Done when:** an attendee lands on `/events`, filters and pages through seeded
events, opens one, and sees its detail — in light and dark, with every pixel
coming from our own tokens.

## Slice 1 — Seat maps and availability

Catalog gains venues with seat maps; Inventory gains allocations. Read-only
availability: an event detail page renders its seat map with seats marked
available or taken. Introduces the seated / general-admission split.

## Slice 2 — Holds under concurrency ★

The reason this project exists. An attendee selects seats and gets an exclusive,
expiring hold.

Where the real work is:

- Optimistic (version column) vs pessimistic (`SELECT … FOR UPDATE`) locking —
  implement both, then load-test them against each other.
- Expiry enforced at read time, with a sweeper as cleanup rather than as the
  source of truth.
- The general-admission counter path, which has different contention
  characteristics from per-seat rows.
- A concurrency test suite that fires N simultaneous requests at the last seat
  and asserts exactly one wins. This is the project's flagship test.

**Invariant under test:** `held + reserved ≤ capacity`, always.

## Slice 3 — Checkout, payments, and the saga

Ordering appears. Cart backed by a hold → simulated payment with configurable
latency and failure → reservation confirmed or hold released. Idempotency keys
so a retried charge cannot double-charge. Compensating actions at every step.

## Slice 4 — Identity and authorization

Accounts, sessions, roles. Deliberately late: attendee flows work anonymously
against a hold until now, and doing auth last avoids the classic trap of
spending the first two weeks on login screens.

## Slice 5 — Organizer console

Create and publish an event, define capacity and price tiers, watch sales. The
first real test of whether the design system composes into dense, data-heavy UI
rather than just marketing-shaped pages.

## Slice 6 — Operational maturity

Structured logging with correlation ids, metrics, tracing across the saga,
notifications persisted from domain events, and a load-test harness. This is
where the cloud runtime ADR gets written (ADR-0005) — with real requirements
instead of predictions.
