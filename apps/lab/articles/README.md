# Articles

Everything the site publishes. One folder per category, one folder per article:

```
articles/
  event-forge/                    # a category -> the "Event Forge" filter
    one-seat-experiment/          # an article -> /articles/event-forge/one-seat-experiment
      one-seat-experiment.md      #   the main write-up
      takeaways.md                #   a sub-page -> .../one-seat-experiment/takeaways
  programming/                    # a category -> the "Programming" filter
  assets/                         # images; not a category, so not a filter
```

Images are mirrored into `public/media/` keeping their path under `articles/`,
so `assets/data-model.png` is `/media/assets/data-model.png`. Always reference
that absolute URL — a relative one resolves against the page, not the file.

The category folders drive the home page filter, so adding a chip means adding
a folder. Its label is the folder name titleized: `event-forge` reads as
`Event Forge`.

Inside an article folder the main write-up is `<folder>.md`, or `index.md`, or
the only file present. Every other `.md` becomes a linked sub-page.

Title and question are read from the markdown itself — the first `#` heading
and the opening `>` blockquote. Optional YAML front matter (`title`,
`question`) overrides either of them.

## About the lab write-ups

A slice of Event Forge is only done when a test proves something about
behaviour under contention. A browser cannot demonstrate a race; a test that
fires N simultaneous requests and counts the winners can. Each write-up says
what was asked, how it was measured, and what the answer turned out to be —
including the runs that disproved something.

| # | Experiment | Question | Status |
| - | ---------- | -------- | ------ |
| 1 | [OneSeatExperiment](event-forge/one-seat-experiment/one-seat-experiment.md) | Two people claim the same seat at the same instant. Does exactly one win? | ✅ green |
