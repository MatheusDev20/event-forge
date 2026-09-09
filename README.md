# Event Forge

**My personal study lab**

I don't work at Google or Meta, so this is where I get to see for myself how
real systems behave under heavy load — contention, races, and the other
problems that only show up when a lot of things happen at once.

The product itself is ticket plataform, i figure that that it might be a good system to test those concepts.


## Experiments

The write-ups used to live in `apps/lab/` here. That app has been removed —
they now live in my personal site repository and are served from `/writing`.

| # | Experiment | Question | Status |
| - | ---------- | -------- | ------ |
| 1 | OneSeatExperiment | Two people claim the same seat at the same instant. Does exactly one win? | ✅ green |
