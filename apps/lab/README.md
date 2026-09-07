# Event Forge Lab

The public website for the [Event Forge](../../README.md) experiments.

## Why it is self-contained

Event Forge itself stays private; this site does not. So `apps/lab` deliberately
depends on **no `@repo/*` workspace package** — it carries its own TypeScript,
ESLint and Tailwind setup. The write-ups live in `articles/` inside the app for
the same reason, so moving it into its own public repository is a matter of
copying this one folder, not untangling shared config and content.

## Content

Pages are generated at build time from the markdown in [`articles/`](articles/),
which lives inside this app — there is no second copy anywhere else. One folder
per category, one folder per article:

```
articles/
  event-forge/                   # a category -> the "Event Forge" filter
    one-seat-experiment/         # -> /articles/event-forge/one-seat-experiment
      one-seat-experiment.md     #    the main write-up
      takeaways.md               #    a sub-page
  programming/                   # a category -> the "Programming" filter
```

The category folders are what the home page filter is built from, so adding a
chip means adding a folder. The main write-up in an article folder is
`<folder>.md`, or `index.md`, or the only file present; every other `.md`
becomes a linked sub-page.

Title and question are read from the markdown itself — the first `#` heading
and the opening `>` blockquote — so the existing write-ups need no changes.
Optional YAML front matter (`title`, `question`) overrides either of them.

`ARTICLES_DIR` points the loader at that folder; it defaults to `./articles`.
Set it only if the content ever moves out of the app.

## Commands

```bash
pnpm --filter lab dev     # http://localhost:3003
pnpm --filter lab build
pnpm --filter lab lint
```

The layout is intentionally plain — a scaffold to hang the real design on.
