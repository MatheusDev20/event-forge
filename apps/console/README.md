# console

The organizer console — Event-Forge's B2B side, where an event is drafted,
priced, published and opened for sale. The storefront (`apps/web`) reads what
is decided here.

Roadmap calls this Slice 5. **Today**: login works, an organizer's admins add
its people from the Team page, and the shell (layout, routing, theme, API
client) renders only for a signed-in account that belongs to an organizer.
Events CRUD is next.

## Accounts

There is no signup. Accounts are provided:

1. Create an organizer and its first admin, from `apps/server`:
   `pnpm org:create`. If the admin's email already has an account, that
   account is used as it is.
2. That admin signs in and opens **Team** — the people icon in the header,
   shown only to admins of the current organizer. Each person added gets an
   account with a temporary password the admin passes on, as `member` or
   `admin`.
3. They sign in at `/login`. An account in no organizer is told to ask an
   admin.

Being admin of one organizer grants nothing in any other — the API checks the
caller's membership in the organizer named in the URL on every request.

How the session works:

- It is an httpOnly `ef_session` cookie set by the API. This app never reads
  its value — `proxy.ts` only checks that it exists, and the shell asks
  `GET /auth/me` to learn who it belongs to (see `app/lib/session.tsx`).
- `app/(auth)/` holds the login page, `app/(console)/` everything behind the
  session. See docs/adr/0008-identity-sessions-and-memberships.md.

## Running it

```bash
cp apps/console/.env.example apps/console/.env.local
pnpm dev
```

Port **3002** — `apps/web` owns 3000 and `apps/server` 3001, and all three run
under `turbo dev`.

## Why a separate app

Same reasoning the industry settles on: a storefront and a back office share a
domain but almost nothing else. They differ in audience, in navigation shape,
in what a stale read costs, and — once Slice 4 lands — in who is allowed
through the door at all. Folding both into `apps/web` would mean one bundle
shipping organizer-only screens to every visitor, and one auth model trying to
describe two populations.

What they *do* share is deliberate and narrow:

- **`@repo/ui` and `@repo/tailwind-config`** — every colour, radius and type
  step. An organizer who publishes here and checks the result on the public
  site should be looking at the same blue.
- **`@repo/contracts`** — the wire shapes, so a server change fails at both
  clients' type-check rather than in one of them at runtime.
- **The API itself.** There is no separate B2B backend. Catalog already exposes
  the write endpoints this console drives; splitting the service would put one
  bounded context behind two deployments (ADR-0001).

What it does not share is `lib/api/client.ts`, which is a near-copy of the
storefront's on purpose — the two disagree about caching, and that disagreement
is the whole difference. See the note in that file.
