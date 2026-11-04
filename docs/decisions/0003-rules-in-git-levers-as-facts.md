# 0003: Rules live in git, and levers are facts

Date: 2026-11-04

## Decision

boxxy takes two kinds of input, stored in two places. The [rules design](../design/boxxy/rules.md)
lists each kind.

- **Policy** lives in git, in a config repo: pools, pipelines, gates, experiments and plug-in code.
  The rules version is the commit hash. A change is a PR that takes the full review gate, and a CI
  job replays the last few weeks under the new rules and posts what would have changed. boxxy loads
  a version only from a merged commit.
- **Levers** are facts written through the command API: expedite, rank, defer, pool holds and
  overrides. They act at once and need no PR.
- A rule that needs conditionals or loops becomes a typed plug-in, so the rules file never grows
  into a programming language.

## Rejected alternatives

| Option                                          | Why not                                                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| policy written as facts through the command API | a change to fleet-wide dispatch would skip review and the replay check                                |
| levers changed by PR                            | an expedite or a defer must act at once                                                               |
| conditionals and loops in the rules file        | the rules file turns into an untyped programming language                                             |
| a rules version that names only the config      | replay needs the exact plug-in code, so a version pins each plug-in by name, version and content hash |

## Why

`decide(state at T, rules version V)` is a pure function, so every decision must name the exact
rules that made it. A commit hash does that, and a PR makes each policy change diffable and
reviewed before it reaches dispatch. Levers are the owner's direct steering, and a steer that waits
for a review is no steer.
