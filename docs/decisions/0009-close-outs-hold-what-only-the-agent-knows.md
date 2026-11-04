# 0009: Close-outs hold what only the agent knows

Date: 2026-11-04

## Decision

An attempt's close-out holds only what the agent alone knows. Commits, PRs, CI, findings, tokens and
time come from facts. Each phase kind brings its own typed close-out, and an attempt whose close-out
doesn't parse fails. The [close-out design](../design/boxxy/close-outs.md) defines each field.

- `result`: what the attempt did.
- `criteria`: each criterion linked to its evidence fact. An item is done when every criterion has
  evidence.
- `openItems`: filed through dedupe, and linked to the attempt.
- `friction`: names a target (a skill, a rule, a lint, AGENTS.md or a tool) and becomes a proposal.
  Friction with no target is dropped.

## Rejected alternatives

| Option                                                                                               | Why not                                                                           |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Entire's checkpoint fields as they stand: `intent`, `outcome`, `learnings`, `friction`, `open_items` | `intent` and `learnings` are free text that nothing acts on                       |
| the agent reports its commits, PRs, CI and tokens                                                    | facts hold them, and an agent's report can be wrong                               |
| one close-out shape for every phase                                                                  | a review, a build and a design end with different things to say                   |
| retros filed as backlog items                                                                        | they pile up as items; with a named target they become proposals                  |
| a status the agent sets                                                                              | boxxy derives state from links, attempts and facts, and never from a typed status |

## Why

A review of a 60-issue sample from the tracker in use showed the useful history living in comments
as prose that agents wrote by hand, with the status field falling behind (measured on the sample).
Each close-out field here is either derived from facts or typed so that boxxy can act on it: a
criterion ties to evidence, an open item becomes an item, and friction becomes a proposal for a
named fix.
