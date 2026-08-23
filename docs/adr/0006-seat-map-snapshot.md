# ADR-0006: Catalog owns the seat map; Inventory snapshots it

- **Status:** Accepted
- **Date:** 2026-08-23

## Context

`docs/domain-model.md` puts **Seat Map** in Catalog — it belongs to a Venue and
is reused across Events — and **Allocation** in Inventory, as the units of
capacity one Event puts on sale. A seated Allocation is therefore a claim about
a specific Seat, and Seat lives in the other context.

ADR-0001 forbids foreign keys across context boundaries: cross-context
references are ids, and integrity there is the application's job. That rule was
easy to accept while nothing crossed. It is not easy here — `allocations` is the
one table in this system where an orphaned or mistargeted row is a correctness
bug rather than a display bug, and it is exactly the table the rule would leave
without a foreign key.

There is a second force, and it is the one that actually decides this. A Venue's
seat map is *mutable and long-lived*: a theatre renumbers a balcony, a stadium
converts a stand, a section is closed for renovation. An Event that went on sale
last month sold specific seats under the layout that existed then. If Inventory
points at Catalog's live seat rows, editing a venue silently rewrites what
someone already bought.

## Decision

Catalog owns the seat map as a **template**. Inventory **copies** the part it is
selling into its own tables when an Event is published, and from then on refers
only to its own copy.

- Catalog gains `seat_maps → sections → seat_rows → seats`, hanging off Venue.
  An Event names which seat map it is using. All of this is one context's
  business and keeps ordinary foreign keys.
- On `EventPublished`, Inventory materialises one Allocation row per Seat for
  seated sections, and one counter row per general-admission section.
- Allocation rows carry the seat's identity **denormalised** — section name, row
  label, seat label — plus `catalog_seat_id` as a plain `uuid` with no foreign
  key, for tracing a unit back to the layout it came from.
- Inventory never joins to Catalog's tables. A ticket renders from Inventory's
  own copy, at any point in the future, whatever Catalog has done since.
- Catalog may not delete or renumber a seat map that has been snapshotted. That
  is Catalog's rule to enforce, and it needs no knowledge of Inventory: the
  organizer console edits layouts, and an Event past `published` pins one.

`EventPublished` gets its first real subscriber here. It was named in the domain
model before anything emitted it; this is the decision that makes the in-process
event bus load-bearing rather than decorative.

## Consequences

- The one FK that matters most — Allocation to the unit it allocates — is
  internal to Inventory and enforced by Postgres.
- The context map's arrow stays as drawn: Catalog → Inventory. Inventory still
  imports nothing from Catalog, and Catalog still knows nothing about holds.
- Seat identity is stored twice, and the copies can legitimately disagree once a
  venue is edited. That is not drift to be reconciled — it is the point. The
  snapshot is what was sold; the template is what exists now.
- Publishing an event becomes a write of thousands of rows for a large venue,
  inside a transaction, rather than an `UPDATE ... SET status`. That is real
  cost and it is deliberate: it moves the expensive work to publish time, which
  happens once and is not latency-sensitive, and away from the hold path, which
  happens under contention and is.
- A general-admission section snapshots to a single counter row, so the two
  strategies the roadmap wants compared are visible in the same table from the
  first migration.
- Republishing after an unpublish needs a reconciliation rule (Slice 5's
  problem). Until the organizer console exists, publish is one-way.

## Alternatives considered

- **`allocations.seat_id` referencing Catalog's `seats`, no foreign key.**
  Honours ADR-0001 to the letter and costs nothing to build. Rejected: it puts
  the weakest integrity guarantee in the system under the strongest correctness
  requirement, and it still does not survive a venue being re-lettered.
- **Move Seat Map into Inventory.** Makes the foreign key legal and internal.
  Rejected: Catalog could no longer render a venue's layout without asking
  Inventory, which inverts the dependency the context map is built on, and it
  makes the "what does exist" context depend on the "what is free" one.
- **A real foreign key across the boundary, and amend ADR-0001.** The pragmatic
  monolith answer. Rejected because the boundary rule is the thing this project
  is practising; the first time it is inconvenient is the first time it is
  actually doing work. Snapshotting is what the extracted-service version would
  have to do anyway.
