# Event Forge Lab

The public website for the [Event Forge](../../README.md) experiments.

## Why it is self-contained

Event Forge itself stays private; this site does not. So `apps/lab` deliberately
depends on **no `@repo/*` workspace package** — it carries its own TypeScript,
ESLint and Tailwind setup. Moving it into its own public repository is a matter
of copying the folder and the `experiments/` content, not untangling shared
config.

## Content

Pages are generated at build time from the markdown in `experiments/`, one
folder per experiment:

```
experiments/
  one-seat-experiment/
    one-seat-experiment.md   # the main write-up  -> /experiments/one-seat-experiment
    takeaways.md             # an extra document  -> /experiments/one-seat-experiment/takeaways
```

The main write-up is `<folder>.md`, or `index.md`, or the only file present.
Every other `.md` in the folder becomes a linked sub-page.

Title, question and status are read from the markdown itself — the first `#`
heading, the opening `>` blockquote and a `Status: **green**` line — so the
existing write-ups need no changes. Optional YAML front matter (`title`,
`question`, `status`) overrides any of them.

`EXPERIMENTS_DIR` points the loader at that folder; it defaults to
`../../experiments`. Set it when the app lives somewhere else.

## Commands

```bash
pnpm --filter lab dev     # http://localhost:3003
pnpm --filter lab build
pnpm --filter lab lint
```

The layout is intentionally plain — a scaffold to hang the real design on.
