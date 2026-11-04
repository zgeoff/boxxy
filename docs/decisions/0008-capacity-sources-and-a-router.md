# 0008: Capacity sources are plug-ins, and a router picks one per attempt

Date: 2026-11-04

## Decision

boxxy budgets against both kinds of limit, usage windows and money, as capacity-source plug-ins.
The [capacity design](../design/boxxy/capacity.md) describes each source, the router and the pacing
gate. All of it is proposed, and it lands in slice 2 (see [0014](./0014-first-slice.md)).

- Each capacity source has a unit, a reset and a reader. Examples: a subscription account's usage
  window, and a pay-per-token provider's balance. Each reading is a fact.
- The recipe sets the model. A router picks the source at claim time. Provider and model are part
  of the recipe, so a model swap is an experiment arm.
- A pacing gate holds lower-priority pools when a source's burn forecast runs out before its reset,
  and keeps a reserve for the owner's own sessions. Expedite lifts the gate.
- A recipe sets a spend cap per phase and model. An attempt over its cap goes to the judgement
  pool.
- Sources compare in one unit: money per landed change, with quality guards beside it.

## Rejected alternatives

| Option                                                    | Why not                                                                                            |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| a single budget model: usage windows only, or money only  | the fleet runs on more than one kind of capacity, and a pay-per-token provider is limited by money |
| the recipe sets the source                                | a choice between sources that serve the same model would confound experiments                      |
| cost from the agent's own OTel figure for a proxied model | that figure is likely wrong for a model the agent doesn't price, so cost comes from the provider   |
| one cap per attempt for all models                        | one attempt uses several models (main, subagents, an advisor, a review model)                      |

## Why

Routing among sources that serve the same model does not change outcomes, so the router can act
without confounding any experiment. Short attempts let the router pick the source at claim
time, and no long session has to move (see [0002](./0002-one-attempt-per-phase.md)). Readings as
facts keep every pacing decision replayable, like every other decision.
