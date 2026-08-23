# ADR-0005: Local-first runtime; the cloud deployment decision is deferred

- **Status:** Accepted
- **Date:** 2026-08-22

## Context

The template deploys `apps/server` to AWS Lambda behind a function URL, bundled
with esbuild and provisioned by Terraform in `apps/server/iac/`.

Event-Forge's roadmap points somewhere Lambda is awkward: hold expiry wants a
scheduler or a sweeper, the ordering saga wants a queue, connection pooling
against Postgres wants a long-lived process (or RDS Proxy), and a "you are Nth
in the queue" experience wants a persistent connection. None of that is
impossible on Lambda — it is just a different, more constrained design.

Choosing that constraint now would shape the domain layer around a deployment
target for an app that has no domain layer yet, and no users at all.

## Decision

Run locally only for now: `docker compose` provides Postgres and, when the
Inventory work needs it, Redis. No cloud deployment until there is something
worth deploying.

- The Lambda Terraform and `build:lambda` stay in the tree, dormant and
  unwired. They cost nothing sitting there and are a useful reference.
- CI keeps running lint, build, and tests against a Postgres service container.
  `deploy-server.yml` is disabled rather than deleted.
- The server code stays deployment-agnostic: no Lambda-specific assumptions
  leak into modules, and anything stateful goes in Postgres or Redis rather
  than process memory — so both futures stay open.
- The runtime decision gets its own ADR once Inventory and Ordering exist and
  the real requirements (background jobs, queues, pooling) are facts rather
  than predictions.

## Consequences

- No deployment pipeline to maintain, and no AWS bill, during the phase where
  the design churns most.
- No production-like environment either. Latency, cold starts, and connection
  limits stay invisible until we deploy — a real gap in a project about
  scaling, and the reason this ADR is explicitly a deferral rather than a
  rejection.
- Keeping state out of process memory is a small ongoing discipline that pays
  for itself under either future.

## Alternatives considered

- **Container / long-lived server now** (ECS, Fly, Railway). The likely eventual
  answer, and the one the roadmap points at. Deferred rather than chosen so the
  requirements come from the domain instead of the other way around.
- **Keep Lambda and design within it.** Interesting constraint-driven
  engineering — RDS Proxy, EventBridge for expiry, SQS for the saga. Rejected
  for now: it constrains the domain design before the domain exists.
