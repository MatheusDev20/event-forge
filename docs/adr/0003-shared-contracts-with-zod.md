# ADR-0003: A shared contracts package, schemas defined with zod

- **Status:** Accepted
- **Date:** 2026-08-22

## Context

The template has request/response shapes declared twice: `class-validator` DTOs
on the Nest side, hand-written types in `apps/web/types` on the Next side. They
are related by nothing except the author's memory, so they drift — and the drift
surfaces at runtime, in the browser, as `undefined`.

A monorepo that doesn't share its API contract is just two repos with one
lockfile. This is the seam where the monorepo actually pays for itself.

Both `zod` and `class-validator` are already installed on the server, which is
one too many.

## Decision

Create `packages/contracts` as the single source of truth for everything that
crosses the network boundary.

- **zod schemas** define request and response shapes; TypeScript types are
  inferred (`z.infer`), never hand-written.
- The **server** validates inbound payloads against the same schemas via a
  zod-backed validation pipe, replacing `class-validator` DTOs.
- The **web app** imports the inferred types for its TanStack Query hooks and
  parses responses at the boundary, so a contract violation fails loudly at the
  fetch instead of quietly three components deep.
- The package is organised by bounded context (`contracts/catalog`,
  `contracts/inventory`, …), mirroring ADR-0001 — a context's public surface is
  its module API plus its contracts.
- Contracts contain **no domain logic**. They are wire shapes. Business rules
  live in the domain model, and a contract must never be imported by it.

## Consequences

- Renaming a field is a compile error across both apps rather than a runtime
  surprise — the single highest-value property of this whole setup.
- One validation library instead of two: `class-validator` and
  `class-transformer` come out of `apps/server`.
- Shared code creates coupling: a breaking contract change breaks both apps at
  once. For one team and one deployable that is exactly what we want; it would
  need versioning if a third party ever consumed the API.
- zod schemas can generate OpenAPI later if a spec is wanted, so this doesn't
  foreclose documentation.

## Alternatives considered

- **OpenAPI spec as source of truth + codegen.** More standard, and right for a
  public API. Rejected here: a build step and generated files to review, for a
  guarantee TypeScript already gives us inside one repo.
- **tRPC.** Best-in-class end-to-end types, but it dissolves the HTTP layer —
  and explicit REST boundaries, status codes, and idempotency semantics are part
  of what this project is for.
