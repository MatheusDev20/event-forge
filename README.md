# Event Forge

**A lab, not a product.**

I don't work at Google or Meta, so this is where I get to see for myself how
real systems behave under heavy load — contention, races, and the other
problems that only show up when a lot of things happen at once.

A ticketing platform is the excuse.

## Experiments

Each one is written up in [`experiments/`](experiments/).

| # | Experiment | Question | Status |
| - | ---------- | -------- | ------ |
| 1 | [OneSeatExperiment](experiments/one-seat-experiment.md) | Two people claim the same seat at the same instant. Does exactly one win? | ✅ green |
