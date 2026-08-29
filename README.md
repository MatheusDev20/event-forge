# Event-Forge

A ticketing platform — browse events, hold seats, buy tickets — built as a lab
for architecture, design-system and scaling practice. Ticketing is the domain
precisely because the naive implementation is provably wrong: two people
clicking "buy" on the last seat at the same moment is a correctness problem.

Grown from a fullstack monorepo template (Turborepo + pnpm).

### Apps

- [NestJS](https://docs.nestjs.com/) API under `apps/server` — a modular
  monolith, one Nest module per bounded context
- [Next.js](https://nextjs.org/) web app under `apps/web`

### Packages

- `@repo/contracts` — zod schemas shared by both apps; the single source of
  truth for everything that crosses the network
- `@repo/ui` — the design system: token layers plus Radix-based components
- `@repo/tailwind-config` — the design tokens themselves
- `@repo/typescript-config`, `@repo/eslint-config`

### Getting started

```bash
pnpm install
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env.local

# Terminal 1 — Postgres 18 on localhost:5433 (5432 is often already taken)
pnpm db:up

# Terminal 2 — schema and seed data, then everything in watch mode
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm dev` runs three watchers under turbo: `@repo/contracts` (tsc --watch),
`apps/server` (nest --watch) and `apps/web` (next dev). Contracts are compiled
once before the watchers start, so the server finds them on its first boot.

| Command                               | What it does                                        |
| ------------------------------------- | --------------------------------------------------- |
| `pnpm dev`                            | Contracts watch + server + web, all hot-reloading   |
| `pnpm db:up` / `db:down`              | Local Postgres lifecycle                            |
| `pnpm db:reset`                       | Drops the volume and recreates the database         |
| `pnpm db:migrate`                     | Applies pending migrations (see Schema changes)     |
| `pnpm db:fresh`                       | Reset + migrate + seed, in one command              |
| `pnpm db:seed`                        | Wipes and rewrites the catalog seed data            |
| `pnpm lint` / `pnpm build`            | Workspace-wide                                      |
| `pnpm test`                           | Unit tests                                          |

|               | Port |                                                                   |
| ------------- | ---- | ----------------------------------------------------------------- |
| `apps/web`    | 3000 | `next dev`'s default                                              |
| `apps/server` | 3001 | overridable with `PORT`; they'd collide on 3000 under `turbo dev` |

The API answers on `http://localhost:3001/health`; everything else sits behind
the `api/v1` prefix, which is what `NEXT_PUBLIC_BACKEND_URL` points the web app
at.

**The database is required**, unlike the template this came from: the server
fails to boot without it. See `docs/adr/0002-persistence-and-migrations.md`.

#### Connecting with a GUI client

| Field    | Value             |
| -------- | ----------------- |
| Host     | `localhost`       |
| Port     | `5433`            |
| Database | `event_forge_db`  |
| User     | `postgres`        |
| Password | `postgres`        |

A change to any `DB_*` value in `apps/server/.env` is picked up by both the app
and `docker compose` — compose reads that same file. Renaming the database
after the volume exists needs `pnpm db:reset`, because Postgres only creates
`POSTGRES_DB` on first initialisation.

### Schema changes

Every schema change is a migration. `synchronize` is off and stays off, so
nothing reaches the database except through a file in
`apps/server/src/database/migrations/` — reviewed like any other code.
See `docs/adr/0002-persistence-and-migrations.md`.

| Command                                | What it does                                            |
| -------------------------------------- | ------------------------------------------------------- |
| `pnpm db:migrate:generate <Name>`      | Diffs the entities against the live DB and writes the SQL |
| `pnpm db:migrate:create <Name>`        | Empty migration, for changes TypeORM cannot diff        |
| `pnpm db:migrate`                      | Applies everything pending                              |
| `pnpm db:migrate:revert`               | Rolls back the last applied migration                   |
| `pnpm db:migrate:show`                 | `[X]` applied, `[ ]` pending                            |
| `pnpm db:migrate:check`                | Fails if entities and schema disagree (runs in CI)      |
| `pnpm db:fresh`                        | Drops the volume, migrates, seeds                       |

`<Name>` is PascalCase and describes the change, not the ticket: `AddSeatMaps`,
`AddHoldExpiryIndex`, `BackfillEventSlugs`.

The normal loop:

```bash
# 1. edit the entity
# 2. write the migration from the diff
pnpm db:migrate:generate AddSeatMaps
# 3. READ IT — a generated migration is a first draft, not an answer
# 4. apply
pnpm db:migrate
```

Step 3 is not optional. `generate` writes what makes the schema match the
entities, which is not always what you meant: a renamed column looks exactly
like a drop plus an add, and it will happily throw the data away. Rewrite those
by hand.

Use `db:migrate:create` when there is nothing to diff — backfills and data
migrations, or DDL needing `CONCURRENTLY` or a lock timeout, which the
generator does not emit.

**Declare indexes and constraints on the entity**, with the same name the
migration gives them. TypeORM diffs against entity metadata, so anything the
entity does not know about reads as drift, and the next generated migration
will try to drop it. `pnpm db:migrate:check` catches this, in CI and locally.

### Hero image uploads

`POST /api/v1/events/:id/hero-image` replaces an event's artwork and writes the
resulting URL to `events.hero_image_url`. `multipart/form-data`, the image in a
field named `file`, 5 MiB ceiling, **JPEG and PNG only**:

```bash
curl -X POST http://localhost:3001/api/v1/events/<id>/hero-image \
  -F "file=@poster.png;type=image/png"
```

A request offers three claims about what it is carrying — the filename's
extension, the part's `Content-Type`, and the bytes — and a client writes all
three. All three are checked and must agree, so a `.gif` is refused by name and
an executable renamed `payload.png` is refused by its bytes. The rules live in
`src/modules/catalog/domain/hero-image.ts` and are unit-tested without a server.

Two storage backends sit behind one switch, and the column records only an
absolute URL either way — so flipping it changes where new images go and leaves
existing rows working:

| `S3_UPLOAD` | Bytes go to                          | URL looks like                             |
| ----------- | ------------------------------------ | ------------------------------------------ |
| `false`     | `UPLOADS_DIR`, served by the API     | `{PUBLIC_BASE_URL}/uploads/hero-images/…`  |
| `true`      | `S3_BUCKET` under `S3_KEY_PREFIX`    | `{S3_PUBLIC_BASE_URL or the bucket}/…`     |

With `S3_UPLOAD=true`, `S3_BUCKET` and `S3_REGION` are required and the server
refuses to boot without them, rather than failing on the first upload.
Credentials come from the AWS SDK's own provider chain, never from this app's
environment schema. `S3_ENDPOINT` points the client at MinIO or LocalStack
(and switches to path-style addressing). See `apps/server/.env.example`.

Adding a third backend is one class implementing `HeroImageStorage` and one
branch in `catalog.module.ts`; nothing above that port knows a file or a bucket
was involved.

### Architecture

Decisions live in `docs/`, and the ones that were expensive to make are written
down rather than inferred from the code:

- `docs/product-brief.md` — what this is, and the non-goals that keep it finite
- `docs/domain-model.md` — the bounded contexts and their vocabulary
- `docs/roadmap.md` — the vertical slices, in order
- `docs/adr/` — one file per architectural decision

### Deploying the server (AWS Lambda) — dormant

**Not in use.** Event-Forge runs locally while the domain takes shape; the
Terraform below is inherited from the template and kept as a reference. The
runtime decision gets made once Inventory and Ordering exist and the real
requirements are facts rather than predictions — see
`docs/adr/0005-local-first-runtime.md`.

`apps/server/iac/terraform` wraps the Lambda in the
[lambda-wrapper module](https://github.com/MatheusDev20/terraform-modules).
`esbuild` bundles the app to a single `dist-lambda/index.js`, and the module runs
its own `archive_file` over that **directory** — it takes `source_dir`, never a
prebuilt `.zip`.

One-time setup:

1. Create the S3 state bucket in your AWS account (versioning on).
2. `cd apps/server/iac/terraform && cp backend.hcl.example backend.hcl`, then
   fill in the bucket name. The backend is a _partial_ config so this template
   carries no account-specific values.
3. `pnpm server:deploy:plan` to check, `pnpm server:deploy` to ship.

The deployed function gets a public Lambda function URL; `terraform output
function_url` prints it, and health lives at `<url>health`.

### CI

| Workflow                              | Trigger                                                                              | Does                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`            | every push to `main` + all PRs                                                       | install, lint, build, unit tests, e2e against a Postgres service container |
| `.github/workflows/deploy-server.yml` | push to `main` touching `apps/server/**`, `packages/**` or the lockfile; also manual | builds the bundle, `terraform apply`, then smoke-tests `/health`           |

Configure in the repo's GitHub settings:

- Secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- Variable: `TF_STATE_BUCKET` (same bucket as `backend.hcl`)

Locally Terraform uses the named AWS profile from `variables.tf` (default
`matheus`); CI sets `TF_VAR_aws_profile=""` so the provider falls back to those
credentials instead.

### Folder Structure

```bash
├─ apps/
│  ├─server/
│  │  ├─ package.json
│  │  └─ ...
│  ├─web/
│  │  ├─ package.json
│  │  └─ ...
│
├─ docs/
│  ├─ product-brief.md
│  ├─ domain-model.md
│  ├─ roadmap.md
│  └─ adr/
│
├─ packages/
│  ├─contracts
│  │  ├─ package.json
│  │  └─ ...
│  ├─config-tailwind
│  │  ├─ package.json
│  │  └─ ...
│  ├─eslint-config
│  │  ├─ package.json
│  │  └─ ...
│  ├─typescript-config
│  │  ├─ package.json
│  │  └─ ...
│─ │─ui
│  │  ├─ package.json
│  │  └─ ...
│
├─ package.json
└─ README.md
└─ pnpm-workspace.yaml
└─ .gitignore
└─ pnpm-lock.yaml
└─ turbo.json
└─ .npmrc
```
