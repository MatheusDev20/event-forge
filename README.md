# Event Forge

**My personal study lab**

I don't work at Google or Meta, so this is where I get to see for myself how
real systems behave under heavy load — contention, races, and the other
problems that only show up when a lot of things happen at once.

The product itself is ticket plataform, i figure that that it might be a good system to test those concepts.


## Experiments

Each one is written up in [`experiments/`](experiments/).

| # | Experiment | Question | Status |
| - | ---------- | -------- | ------ |
| 1 | [OneSeatExperiment](experiments/one-seat-experiment.md) | Two people claim the same seat at the same instant. Does exactly one win? | ✅ green |
