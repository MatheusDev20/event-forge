# Event-Forge — Product Brief

_Last updated: 2026-08-22_

## The pitch

Event-Forge is a ticketing platform: organizers publish events with seated or
general-admission capacity, and attendees browse, hold seats, and buy tickets.
It is a **lab project** — the product exists to create realistic pressure on the
architecture, not the other way around.

Ticketing was chosen deliberately. It is one of the few consumer domains where
the naive implementation is provably wrong: two people clicking "buy" on the
last seat at the same moment is a correctness problem, not a UX problem. That
forces real work on concurrency, transactional boundaries, idempotency, and
eventual consistency — the things worth practising.

## Personas

| Persona       | Cares about                                                        |
| ------------- | ------------------------------------------------------------------ |
| **Attendee**  | Finding an event, picking seats, not losing them mid-checkout       |
| **Organizer** | Publishing an event, defining capacity/pricing, watching sales      |
| **Admin**     | Moderating events and organizers, refunds, operational visibility   |

Attendee is the primary persona. Organizer comes second. Admin is a thin
back-office and should stay thin.

## What "done" looks like for v1

An attendee can browse published events, open one, hold specific seats for a
bounded window, and complete a (simulated) purchase that either issues tickets
or releases the hold — correctly, under concurrent load, with the seat count
never going negative.

## Non-goals

These are explicitly out of scope. Revisit only via an ADR — not mid-feature.

- **Real payment processing.** A fake payment gateway with configurable
  latency/failure modes teaches more about idempotency and retries than a
  Stripe integration does, at a fraction of the setup.
- **Mobile apps.** Web only, responsive.
- **Recommendations / personalisation / search relevance.** Filtering and
  pagination, yes. A search platform, no.
- **Multi-tenancy and white-labelling.** One storefront.
- **Internationalisation and multi-currency.** One locale, one currency.
- **Secondary market / ticket resale.** A whole second domain; not now.
- **Dynamic pricing.** Fixed price tiers per event.
- **Real email/SMS delivery.** Notifications are logged and stored, not sent.

## Guiding constraints

1. **Every slice is vertical.** Nothing ships as "the backend part". A slice
   crosses the design system, the web app, the contract, the domain, and the
   database, or it isn't a slice.
2. **Decisions get ADRs.** If reversing it would cost more than a day, it needs
   a numbered record in `docs/adr/`.
3. **The interesting problem gets the effort.** Inventory and Ordering deserve
   careful domain modelling. Catalog and Identity should be as boring as
   possible so there's budget left for the parts that matter.
