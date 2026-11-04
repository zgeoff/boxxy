# 0011: Merge train rules

Date: 2026-11-04

## Decision

Each repo merges through a train with these rules. The
[merge train design](../design/boxxy/merge-train.md) describes how the train runs them.

- A stack of PRs moves as one unit.
- A unit rebases only when it reaches the front of the train.
- The batch size adapts to the measured failure rate of combined batch heads. The batch-size rule is
  a plug-in that reads that rate, not a core constant. The rate comes from a CI fact family in
  pepys.

The stress test adds five rules:

1. At every base move, a conflict probe trial-rebases each open unit, with no push and no CI, and
   starts agent fixes for the conflicts at once.
2. A conflicted unit leaves the batch and requeues after its fix. The train never waits for it.
3. On a red run, the train reruns only the failed tests on the same head before it bisects. A test
   that fails and then passes is quarantined for the train, and a ticket opens to fix it.
4. The adaptive batch size reads only failures that survive the rerun.
5. A unit gets at most 3 agent fix attempts, then escalates. Innocent ejections and bisects in which
   every half passed count as flake alarms.

## Rejected alternatives

| Option                                            | Why not                                                                                                                                               |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| each PR as its own unit                           | on the busiest measured day, 207 PRs were 163 units (measured), and PR-level eager rebasing fired 969 rebases against 150 with stack units (modelled) |
| eager rebase of every open unit on each merge     | after a base move it ran 182 to 229 CI runs against 64 to 83 lazy (modelled)                                                                          |
| lazy rebase with no probe                         | its wait p90 was 72 to 152 min against eager's 43 to 103 (modelled); the probe matches eager's waits at lazy's CI cost                                |
| serial merges                                     | at p90 CI time the wait p50 was 349 min, against 31 min with batches of 4 (modelled)                                                                  |
| hold the train for a conflicted unit at the front | the worst rule tested: wait p90 310 min, and the delay spread to units the base move never touched (modelled)                                         |
| bisect with the adaptive batch size and no rerun  | one flaky test at 30% drove the batch size to serial, gave a wait p90 of 451 min against 38, and ejected 7.9 innocent units (modelled)                |
| a full-CI retry plus quarantine                   | it doubles the path of every real failure: all-unit wait p90 218 to 233 min against a baseline of 105 (modelled)                                      |
| a retry with no quarantine                        | at a 50% flake rate the retry flakes too, and the wait p90 is 361 min (modelled)                                                                      |
| a fixed batch size                                | at a 20% combined-head failure rate, batching stops paying (modelled)                                                                                 |

## Why

One repo took 133 of 207 merges on the busiest measured day, with 18 merges inside 2 minutes, and
that burst was one 17-PR stack (measured). CI wall time was 4.2 min at p50 and 20.2 min at p90
across repos (measured). Batching pays only while combined heads rarely fail: at p90 CI, a batch
size of 6 gives a wait p50 near 30 min at a 5% failure rate, and near-serial waits at 20%
(modelled). The rate is unknown until combined-head runs supply it, so the batch-size rule reads
it. Rerunning only the failed tests plus quarantine kept every stress cell at its baseline
(modelled).
