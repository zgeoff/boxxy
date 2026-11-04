# 0010: Measure conflicts before an overlap hold

Date: 2026-11-04

## Decision

boxxy has no overlap hold yet. Two items that touch the same files both run, and the merge train
records what their conflicts cost. The [merge train design](../design/boxxy/merge-train.md)
describes the conflict fact.

- Each train rebase records a conflict fact: its result (clean, retry, agent or failed), the files
  and the cost. A query shows conflict cost per week.
- Files that always collide, such as changelogs, lockfiles and migration numbers, are fixed in
  tooling.
- A declared-area hold for a hot area is a later rules line, if the data asks for it.

## Rejected alternatives

| Option                   | Why not                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| a file-overlap hold now  | the conflict rate is unknown, so a hold would trade throughput for a cost nobody has measured |
| a declared-area hold now | the same reason, and it needs every item to declare its area up front                         |

## Why

The merge train stress test could not measure how often a rebase conflicts. It swept the conflict
share at 10%, 30% and 60% instead (modelled). The answer moves with that share: at 10% per PR, a
17-PR stack conflicts 82% of the time (modelled). Conflict facts give the real rate and its cost,
and a hold can then be tried as a rules line and compared by replay.
