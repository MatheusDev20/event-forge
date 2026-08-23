# Architecture Decision Records

One file per decision, numbered, never edited after acceptance — superseded by a
new ADR instead. `template.md` is the shape.

The bar: **if reversing it would cost more than a day, it gets an ADR.** Library
picks usually don't. Boundaries, contracts, persistence strategy, and anything
touching the design system's public surface usually do.

| #                                       | Decision                                     | Status   |
| --------------------------------------- | -------------------------------------------- | -------- |
| [0001](0001-modular-monolith.md)        | Modular monolith with enforced boundaries    | Accepted |
| [0002](0002-persistence-and-migrations.md) | TypeORM with migrations; DB is mandatory  | Accepted |
| [0003](0003-shared-contracts-with-zod.md) | Shared zod contracts package               | Accepted |
| [0004](0004-design-system-tokens.md)    | Tokens + headless primitives; drop daisyUI   | Accepted |
| [0005](0005-local-first-runtime.md)     | Local-first runtime; cloud deploy deferred   | Accepted |
