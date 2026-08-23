# ADR-0002: TypeORM with migrations; the database is mandatory

- **Status:** Accepted
- **Date:** 2026-08-22

## Context

The template ships TypeORM configured for prototyping: `synchronize` driven by
`DB_SYNC=true`, entities discovered by globbing `dist/**/*.entity.js`, and the
whole TypeORM module registered conditionally behind `DB_ENABLED` so a fresh
clone boots with no Postgres at all.

Every one of those choices was right for a template and wrong for Event-Forge.
`synchronize` silently rewrites schema and will happily drop a column; there is
no history, no review, and no way to express a data migration. The glob depends
on build output layout. And `DB_ENABLED` guards against an absent database that,
for this project, is never absent — a ticketing app without persistence is not a
degraded app, it is not an app.

Inventory in particular needs schema-level tools — unique constraints, partial
indexes, explicit lock semantics — that `synchronize` cannot express.

## Decision

1. **`synchronize: false`, always.** Schema changes go through TypeORM
   migrations, committed and reviewed like code.
2. **Explicit entity registration.** Each module registers its own entities via
   `TypeOrmModule.forFeature([...])`; drop `DB_ENTITIES` globbing.
3. **The database is mandatory.** Remove the `ConditionalModule` /`DB_ENABLED`
   wrapper. `pnpm db:up` is a prerequisite, and failing to connect at boot is a
   correct, loud failure.
4. **Persistence models are not domain models — where it matters.** Inventory
   and Ordering get plain domain objects that hold the invariants, with entities
   and mappers at the edge. Catalog, Identity and Notifications may use entities
   directly; the ceremony buys nothing there.
5. **Postgres features are fair game.** This project targets Postgres and only
   Postgres. Row locks, partial unique indexes, and `CHECK` constraints are part
   of the design, not leaks in the abstraction.

## Consequences

- Every schema change is a reviewable artifact, and CI can verify migrations
  apply to an empty database and that entities match the migrated schema.
- More friction per change — a migration must be generated and read. That
  friction is the feature; `synchronize` is fast right up until it eats a table.
- The split domain/persistence model in two contexts means mappers to write and
  keep in sync. Confining it to Inventory and Ordering keeps the cost where the
  invariants justify it.
- Committing to Postgres means the repository layer is not portable to another
  engine. Accepted: correct locking beats hypothetical portability.

## Alternatives considered

- **Prisma.** Excellent migrations and DX, but its unit of work and the lock /
  transaction control Inventory needs are a poorer fit, and TypeORM is already
  wired in here.
- **Drizzle + raw SQL.** Genuinely tempting for the Inventory work. Rejected
  for now only to avoid two ORMs; revisit via a new ADR if TypeORM fights the
  concurrency design.
