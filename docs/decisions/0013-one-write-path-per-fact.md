# 0013: One write path per fact

Date: 2026-11-04

## Decision

Each kind of fact has one write path, and every flow that sees the fact calls it. A flow that reads
a fact it is the first to see writes it through that path; it never reads it and moves on. The
[architecture design](../design/boxxy/architecture.md) lists the write path for each fact family.

## Rejected alternatives

| Option                                    | Why not                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| one write path that only one flow calls   | when that flow stops running, the fact stops being recorded, and nothing fails |
| each flow writes its own copy of the fact | the copies drift apart, and queries must pick one                              |
| recover missing facts later by a backfill | a backfill finds the gap only after the measurements built on it are wrong     |

## Why

The review tool records the answer to each finding through one command, and only one flow ran that
command: the merge gate. When the gate switched to a command that reads findings and writes nothing,
answers stopped being recorded, while fixes went on. Since that switch, 2,756 of 2,832 findings have
no recorded answer (measured). No check failed, so the gap showed only when a measurement came out
empty. boxxy measures from facts, so a fact that one flow forgets to write makes every query built
on it wrong.
