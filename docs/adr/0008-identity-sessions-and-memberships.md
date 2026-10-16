# ADR-0008: Provisioned accounts, database sessions, organizer-scoped admins

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

The organizer console (Slice 5) needs someone to be signed in before they can
create venues and events. Until now nothing in the API knew who was calling:
every write endpoint said "Authorization is Slice 4", and `POST /events` took
an `organizerId` in the body, from anyone.

Four questions had to be answered together, because each constrains the
others:

1. **How is a login represented?** A signed token the client holds, or a row
   the server holds?
2. **Where does an account meet an organizer?** `docs/domain-model.md` calls
   an Organizer "the account that owns an Event", but `organizers` is already
   its own table, and real promoters have more than one person running shows.
3. **How do passwords get hashed** in an API that esbuild bundles into a single
   file for Lambda?
4. **Who creates accounts?** Self-service signup, or something narrower?

`docs/product-brief.md` asks for Identity to be "as boring as possible". That
is the bar every choice below is held to.

## Decision

**Identity is its own context** (`src/modules/identity`) with two tables:
`accounts` (email, name, password hash, role) and `sessions`.

**A session is a database row, carried in an httpOnly cookie.** Login creates
32 random bytes, stores their SHA-256 in `sessions.token_hash`, and sets the
raw value as `ef_session` — `HttpOnly`, `SameSite=Lax`, `Secure` outside
development, seven days, fixed expiry. `SessionGuard` looks the hash up on
every guarded request; logout deletes the row.

**The guard is opt-in.** Routes that need an account say
`@UseGuards(SessionGuard)` and read it with `@CurrentAccount()`. The
storefront's reads and the hold race stay anonymous, as the roadmap requires.

**Accounts are provisioned, never self-created, and admin is a role inside
one organizer.** There is no signup route and no platform-wide admin screen.
A membership's role is `admin` or `member`; an organizer's admins add people
to *that* organizer through `/organizers/:organizerId/members`, which
`OrganizerAdminGuard` (in Catalog) allows only when the caller's own
membership in the organizer in the URL is `admin`. Adding a person creates
their account with a temporary password the admin chooses and passes on.

The one thing no admin can do is create an organizer, because a new organizer
has no admin yet. `pnpm org:create` does: it creates the organizer and makes
an account its first admin — attaching the account if the email already has
one, creating it otherwise — through the same services the API uses.

**Organizers have members.** `organizer_members (organizer_id, account_id,
role)` lives in **Catalog**, not Identity: an organizer is Catalog's concept,
and the domain model's rule is that other contexts hold an account id and
nothing else. So the table has a foreign key to `organizers` and none to
`accounts` (ADR-0001). Adding a member is two writes in two contexts —
Identity's account, then Catalog's membership — checked in an order that
makes a stranded account (one with no membership) the worst outcome.

**Passwords use scrypt from `node:crypto`** (N=2^15, r=8, p=1), stored as
`scrypt$N$r$p$salt$hash` so the cost can be raised later without invalidating
existing hashes.

**The console only logs in.** `apps/console/proxy.ts` redirects to `/login`
when the cookie is absent; the console shell asks `GET /auth/me` and redirects
on a 401 when the cookie is present but no longer valid. An account with no
membership is told to ask an admin of its organization. Admins of the current
organizer get a Team icon in the header — deliberately not a sidebar item,
which is kept for the sections of work.

## Consequences

- Logging out actually ends a session, everywhere, immediately. So would
  deleting an account or, later, a "sign out of all devices" button — each is
  a `DELETE`.
- Every guarded request costs one indexed query. At console traffic that is
  nothing; it is also why the guard is not global.
- **The console and the API must share a site.** The cookie is set by the API
  and read by the console's proxy, which works locally because cookies ignore
  ports. In a deployment that means `console.example.com` and
  `api.example.com` with the cookie's `Domain` set to the parent — or the
  console proxying `/api` to the backend. Two unrelated domains would break the
  proxy check and `SameSite=Lax` alike. ADR-0005 defers deployment, so this is
  recorded rather than solved.
- CSRF is handled by `SameSite=Lax` plus CORS restricted to two named origins
  with credentials. There is no CSRF token. That is sufficient while every
  state-changing request is a JSON `POST` (which forces a preflight); a plain
  HTML form posting to the API would need revisiting.
- Organizers created by the seed have no members and cannot be reached from the
  console. That is accurate — no account made them.
- An account belongs to many organizers, but the console acts for the first
  one. An organizer switcher is the obvious next screen once anyone has two.
- Every new user costs an admin a few minutes, and onboarding depends on one
  being available. That is the intended trade: who can act for an organizer
  is a decision that organizer makes, not a form anyone fills in.
- New organizers need someone with shell access to the server. Fine while
  organizers are few and hand-onboarded; a platform operator screen is the
  answer when they are not, and would be a new role, not a reuse of this one.
- `accounts.role` (`attendee | organizer | admin`) no longer decides anything
  in the console: every provisioned account is `organizer`, and what an
  organizer may do is its membership role. The column stays because the
  glossary defines it and the storefront's attendees will need it.
- Temporary passwords travel outside the system (chat, email, in person) and
  there is no way yet to change one. A "change password" screen, then forced
  change on first login, are the obvious follow-ups.
- An email that already has an account cannot be added to a second organizer
  through the admin screen — the request is a 409. Attaching an existing
  account is a separate, small endpoint when someone needs it.
- Attendee signup, when the storefront needs one, will be a separate decision:
  attendees are self-serve by nature, organizers are not.

## Alternatives considered

- **JWT in a cookie or in `localStorage`.** No table and no lookup per request,
  but logout becomes "forget the token and hope", and revocation needs a
  denylist — a sessions table with extra steps. `localStorage` also hands the
  token to any script an XSS bug lets onto the page.
- **A hosted provider (Auth0, Clerk, Cognito).** Less code, but a third-party
  dependency in the one context meant to be boring, an external service in a
  project that is local-first (ADR-0005), and nothing left to learn from.
- **Passport.js.** Adds strategies and serialisation for what is, here, two
  queries and a cookie. The guard is shorter than the configuration would be.
- **argon2 or bcrypt.** Both are native addons; esbuild cannot inline a `.node`
  binary, and the failure appears at runtime on Lambda, not at build. scrypt
  is memory-hard, OWASP-listed and ships with Node.
- **Account *is* the organizer** (drop `organizers`, point events at an
  account). Simplest, but one login per company — no staff — and a migration
  of every event the day that changes.
- **A platform-wide admin** who sees and manages every organizer. Built and
  removed the same day: an organizer's people are that organizer's business,
  and one role that reaches into all of them is a larger blast radius than
  anything here needs.
- **Self-service signup with an onboarding step** (create an account, then
  name your organizer). Built first and removed the same day: it let anyone
  become an organizer, and an organizer is someone who sells tickets under
  this platform's name.
- **Invitation links** (admin enters an email, the person sets their own
  password from a link). Better for the user, but needs email delivery, which
  this project does not have (docs/product-brief.md, non-goals). The
  temporary-password flow is what works without it.
- **Membership in Identity.** Would make Identity know what an organizer is,
  and every Catalog query that scopes by organizer would have to ask another
  context for permission. Catalog owning the link keeps that question local.
