# Merge train

The merge train lands each repo's approved pull requests one batch at a time, so one merge doesn't
send every other open pull request back to rebase. Stacks move as one unit, a unit rebases only at
the front of the train, and the batch size follows the measured rate at which combined batches fail.
The train comes after slice 1 (see [slice 1](./slice-1.md)); the `modules/train` package will hold
it (see [the layout](./layout.md)).

The decisions behind this doc are
[0011: merge train rules](../../decisions/0011-merge-train-rules.md) and
[0010: measure conflicts before an overlap hold](../../decisions/0010-measure-conflicts-before-an-overlap-hold.md).

## The merge gate

The train merges a unit only when each of its heads passes the merge rule of
[review, verify and merge](./review-and-merge.md#the-merge-step): every required check green, a
passed review at that head, and a verified verify reading at that head.

- **boxxy reads its own review record at the head, never the review tool's GitHub check.** The
  review tool, noslop, passes its check at a head that no review has read, and after a failed
  review call.
- **A clean rebase makes the next review cheap.** noslop keys each file's review on a hash of the
  file's patch with the hunk line numbers left out. A clean rebase, or a merge of the base that
  touches no line near the pull request's hunks, keeps every key, so the review at the new head
  reads no file. Only a file whose key changes needs a new review.

The train replaces `decideMerge` and keeps its outcomes, so the pipeline's merge phase and its
edges stay the same.

## Units

A unit is one pull request, or one stack: pull requests whose base is another open pull request's
head. A stack enters the train, rebases, runs CI and merges as one unit.

## The train

```text
 ready units (gate passed) ──▶ queue per repo
   │ front of the queue
   ▼
 rebase the front units onto the base
   ├─ conflict ──▶ the unit leaves the batch; agent fix; requeue
   ▼ clean
 batch of up to <cap> units ──▶ CI on the combined head
   ├─ green ──▶ merge every unit
   ▼ red
 rerun only the failed tests on the same head
   ├─ fails, then passes ──▶ quarantine the test; open a ticket; the batch goes on
   ▼ fails again
 bisect; eject the failing unit; requeue the rest
```

- **Rebase lazily, at the front.** A unit rebases only when it reaches the front of the train, which
  caps rebases at one per unit each time it reaches the front.
- **Probe for conflicts at every base move.** Each time the base moves, boxxy trial-rebases every
  open unit with no push and no CI. A conflict starts an agent fix early, so the unit is ready by
  the time it reaches the front. The probe aims at eager rebasing's wait for lazy rebasing's CI cost
  (proposed; not yet modelled).
- **A conflicted unit leaves the batch.** It requeues after its fix. The train never waits for it.
- **Rerun failed tests before bisecting.** On a red run, boxxy reruns only the failed tests on the
  same head. A test that fails and then passes is quarantined for the train, and a ticket opens to
  fix it.
- **At most 3 agent fix attempts per unit.** After the third, the unit escalates to the owner.
  Innocent ejections and bisects in which every part passes count as flake alarms: signs that a
  flaky test failed the batch.
- **Every rebase at the front writes a conflict fact:** the result (clean, retry, agent or failed),
  the files and the cost. A query shows conflict cost per week. Files that always collide, such as
  changelogs, lockfiles and migration numbers, get fixed in tooling.

A pull request that falls behind its base, conflicts or fails CI outside the train goes to a
triggered phase: a script attempt first, and an agent attempt only when the script can't handle the
outcome (see [dispatch](./dispatch.md)).

## The batch size

The batch-size rule is a plug-in that reads the failure rate per unit, measured on combined batches,
per repo. It counts only failures that survive the rerun, so a flaky test never shrinks the batch.
The rate comes from a CI fact family in pepys: workflow runs and check suites, with start,
completion, conclusion and whether the check is required.

The thresholds below are **proposed and provisional** until combined-head runs supply the rate:

| Failure rate per unit | Cap         |
| --------------------- | ----------- |
| 5% or less            | 6           |
| near 10%              | 3           |
| above 20%             | near serial |

The bands come from the modelled sweep below, which varies the same per-unit rate. Above 20%,
batching stops paying: a cap of 6 waits as long as serial merging.

## The evidence

The numbers below come from one real busy day: 207 merged pull requests across 21 repos. Each is
labelled **measured** (read from data) or **modelled** (the output of a throwaway simulation of
these rules).

- **Measured: the load sits in one repo.** The busiest repo took 133 of the 207 merges, with 18
  merges inside 2 minutes. No other repo reached 20.
- **Measured: stacks cut the units.** Grouping pull requests whose base is another merged pull
  request's head gives 163 units from 207. The busiest repo's 133 are 91 units, and its 18-merge
  burst is one 17-PR stack. This is a lower bound: a stack retargeted to `main` before merge goes
  undetected.
- **Measured: CI wall time** on the final head, from the first suite created to the last suite
  updated:

  | Repo             | Pull requests | p50 (min) | p90 (min) |
  | ---------------- | ------------- | --------- | --------- |
  | the busiest repo | 133           | 4.6       | 20.2      |
  | all repos        | 207           | 4.2       | 20.2      |

- **Modelled: eager rebases.** With stacks as units, rebasing every open unit on each merge fires
  150 rebases; the per-PR model said 969. Lazy rebasing caps it at one per unit.
- **Modelled: the train in the busiest repo**, waits in minutes:

  | CI time                | Serial, p50 / p90 | Batch cap 4, p50 / p90 |
  | ---------------------- | ----------------- | ---------------------- |
  | measured p50, 4.6 min  | 5 / 7             | 5 / 5                  |
  | measured p90, 20.2 min | 349 / 596         | 31 / 39                |

  Caps of 8 and 16 give the same result as 4, because the queue never passed 6 units.

- **Modelled: failure rate against cap.** The final heads can't show how often a combined head
  fails, so the model sweeps a per-unit failure rate F over 500 seeded runs. A failed batch bisects
  and ejects the failing unit. Waits in the busiest repo at p90 CI, in minutes, p50 / p90:

  | F   | Serial    | Cap 3     | Cap 6     |
  | --- | --------- | --------- | --------- |
  | 0%  | 350 / 599 | 32 / 40   | 29 / 39   |
  | 5%  | 350 / 599 | 36 / 99   | 33 / 91   |
  | 10% | 350 / 599 | 77 / 180  | 65 / 217  |
  | 20% | 350 / 599 | 259 / 467 | 347 / 599 |

- **Modelled: a base move sends 40 pull requests to rebase.** Lazy rebasing uses 64 to 83 CI runs
  against eager rebasing's 182 to 229, but waits longer: p90 72 to 152 minutes against 43 to 103.
  Holding the train for a conflicted unit is worst, at p90 310 minutes. The conflict probe and the
  rule that a conflicted unit leaves the batch answer both.
- **Modelled: a flaky test that fails 30% of runs.** Bisecting with the adaptive cap and no rerun
  drives the cap to serial: the exposed wait reaches p90 451 minutes against 38, the day ends at
  14.5 hours instead of 7.9, and 7.9 innocent units are ejected. Rerunning only the failed tests,
  with quarantine, keeps every result at baseline.

## Limits of the evidence

- The model counts only the owner's pull requests, not bot pull requests.
- The busiest measured day had 207 merges. boxxy plans for 300 a day (proposed); the model has not
  run at 300 yet.
- The failure counts on final heads are a lower bound, because a rerun replaces a suite's result.
