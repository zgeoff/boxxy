# 0005: The core stays generic

Date: 2026-11-04

## Decision

The core is items, phases, attempts, facts and plug-in kinds. A specific need goes into data, a
rules line or a plug-in, never into a special case in core code. The
[architecture design](../design/boxxy/architecture.md) draws the core and its plug-in kinds.

- Core churn is the measure: the share of new needs that changed core code instead of adding a
  plug-in or a rules line, beside boxxy's own upkeep cost (proposed).
- When a rule needs conditionals or loops, it becomes a typed plug-in (see
  [0003](./0003-rules-in-git-levers-as-facts.md)).
- The item model never learns how dispatch works.

## Rejected alternatives

| Option                                             | Why not                                                                                                                 |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| a special case in core code for each specific need | the core grows with every need, and its upkeep grows with it                                                            |
| a rules file that grows conditionals and loops     | it moves the special cases into an untyped language                                                                     |
| dispatch logic inside the item model               | a tracker that takes on orchestration grows one feature at a time; Beads, read from its source, shows how far that goes |

## Why

A generic core keeps the cost of a new need in a plug-in, where it can be added, measured and
removed, and keeps the core small enough to stay correct. The older tool that boxxy replaces spent
about 26 to 30 issues a week on its own upkeep, flat over three weeks (measured). Measuring core
churn shows whether boxxy holds to this rule, instead of leaving it to judgement.
