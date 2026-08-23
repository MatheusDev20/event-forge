# ADR-0001: Modular monolith with enforced boundaries

- **Status:** Accepted
- **Date:** 2026-08-22

## Context

Event-Forge has five bounded contexts (see `docs/domain-model.md`). A ticketing
platform is the canonical microservices demo, and the temptation to start with
five deployables is strong — especially in a project whose stated purpose is
practising architecture.

That temptation is worth resisting. Distributed systems make boundaries
*expensive to cross* but they do not make them *correct*. Starting distributed
means paying for network calls, deployment topology, and eventual consistency
while the domain model is still wrong — and the domain model is always wrong at
the start.

## Decision

Build a **modular monolith** in `apps/server`: one deployable, one database,
with each bounded context as a Nest module owning its own tables.

Boundaries are enforced mechanically, not by discipline:

- Each context lives in `src/modules/<context>/` with a public surface —
  exported application services and contract types — and everything else
  internal.
- A lint rule (`eslint-plugin-boundaries` or an import-path restriction) makes
  cross-context deep imports a build failure. A boundary that isn't enforced by
  CI is a suggestion.
- Contexts communicate through application services or in-process **domain
  events**, never by reaching into another context's repositories or entities.
- No foreign keys across context boundaries. Cross-context references are ids,
  and integrity there is the application's job — exactly as it would be over a
  network.

## Consequences

- One `pnpm dev`, one debugger, one transaction when a transaction is genuinely
  needed. Iteration stays fast while the domain is still moving.
- The no-cross-context-FK rule costs referential integrity we could otherwise
  get free from Postgres. That cost is deliberate: it is what keeps extraction
  possible, and it forces us to handle dangling references explicitly.
- If a context is ever extracted into its own service, the work is swapping an
  in-process call for a transport — because the seam already exists and CI has
  been guarding it the whole time. Doing that extraction later, on a context
  whose boundary has been proven, is itself a better exercise than guessing at
  the boundaries today.

## Alternatives considered

- **Microservices from day one.** Rejected: pays the entire distributed-systems
  tax before there is a domain model worth distributing.
- **Layered monolith** (`controllers/`, `services/`, `repositories/`).
  Rejected: layers organise by technical role, so domain concepts smear across
  all of them and no boundary survives contact with a deadline.
