# Experiments

One folder per question. Each write-up says what was asked, how it was
measured, and what the answer turned out to be — including the runs that
disproved something.

| # | Experiment | Question | Status |
| - | ---------- | -------- | ------ |
| 1 | [OneSeatExperiment](one-seat-experiment.md) | Two people claim the same seat at the same instant. Does exactly one win? | ✅ green |

A slice of this project is only done when a test proves something about
behaviour under contention. A browser cannot demonstrate a race; a test that
fires N simultaneous requests and counts the winners can.
