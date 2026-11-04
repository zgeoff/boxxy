# Capacity

boxxy runs attempts on more than one kind of model capacity: subscription accounts with usage
windows, and pay-per-token providers that bill money. This doc covers how boxxy reads each source,
picks one per attempt, slows down before a source runs out, and compares sources on one unit. The
whole design is proposed. It ships in slice 2 (see [slice 1](./slice-1.md) for what comes first).

The decision behind this doc is
[0008: capacity sources and a router](../../decisions/0008-capacity-sources-and-a-router.md). The
`modules/capacity` package holds the code, and each source has an adapter named `capacity-<system>`
(see [the layout](./layout.md)).

## Capacity sources

Each capacity source declares a unit, a reset and a reader. Each reading is a fact, so `decide()`
reads capacity the same way it reads everything else, and a replay sees the reading dispatch saw
(see [dispatch](./dispatch.md)).

| Source kind                           | Unit                            | Reset                | Reader                                     |
| ------------------------------------- | ------------------------------- | -------------------- | ------------------------------------------ |
| a subscription account's usage window | percent of each window used     | when the window ends | the provider's rate-limit response headers |
| a pay-per-token provider's balance    | money: credit balance and spend | none; a top-up       | the provider's billing API                 |
| another vendor's agent subscription   | not yet known                   | not yet known        | not yet known                              |

A provider can limit model classes separately. A source is then one account and one model class, so
a reading for one class never stands in for another.

## Models and the router

A recipe declares its model set per phase: the main model, the subagent model, the advisor and any
review model. One attempt uses several models, so a recipe that named only one would hide part of
its spend.

The router picks a capacity source for each attempt when the claim commits. Attempts are short, so
no long session has to move between sources, and rotation is a choice made at each claim.

- **Routing among accounts that serve the same model through the same provider doesn't change
  outcomes.** It never confounds an experiment, so the router is free to balance load across them.
- **The model and the provider that serves it are part of the recipe.** A model swap, or a move from
  a subscription to a pay-per-token provider, changes the recipe, so it is an experiment arm, never
  a routing choice.

Once atc accepts telemetry attributes on spawn, the `worker-atc` adapter stamps the chosen source on
the session's telemetry, so every request record carries its source (see
[measurement](./measurement.md#spend-capture)).

## The pacing gate

The pacing gate is a gate plug-in (see [planning](./planning.md)). It holds lower-priority pools off
the frontier when a source's burn forecast runs out before the source's next reset.

- **The forecast is per source.** It takes the queued work, times each phase's measured model mix,
  and compares the demand with what is left on each source.
- **A reserve stays free for the owner's own sessions.** The gate holds dispatch before the source
  reaches the reserve, so the owner never finds a source spent by the fleet.
- **Expedite lifts it.** Expedite is the gate's waiver, so an owner pull runs even while the gate
  holds a pool.
- **A failed gate holds.** If the pacing plug-in throws, the gate holds with the fault as its
  reason, as every gate does.

## Caps per phase and model

A recipe sets a spend cap per phase and model. An attempt that goes over a cap stops and goes to the
judgement pool (see [planning](./planning.md)), which decides whether to retry, re-plan or ask the
owner. Caps are per model because a cheap subagent model and an expensive main model in the same
attempt need different caps.

## One unit for comparison

boxxy compares sources on money per landed change:

- **A subscription:** its fee for the period, spread over the changes it landed in that period.
- **A pay-per-token provider:** the cost the provider billed for the attempts on the change. boxxy
  takes this cost from the provider, never from the agent's own cost estimate.

A cheaper change that gets reverted costs more in the end, so quality guards ride with the unit:

- a revert within 14 days;
- review findings per PR;
- owner minutes per landed change.

## The model-swap eval

The first experiment swaps the build phase's main model for a pay-per-token model behind a proxy. It
is a live-bucket experiment (see [measurement](./measurement.md#experiments)):

```yaml
# experiments/build-model-swap-v1.yaml
experiment: build-model-swap-v1
type: live-bucket
phase: build
arms: { champion: 90, challenger: 10 }
challenger: { recipe: build-pay-per-token@1 }
cohort: [kind]
metrics:
  primary: cost-to-land # money per landed change, with each source's cost rule
  # guards [revert-14d, findings-per-pr, owner-minutes] join once the verdict reports guards
sample: { effect: 0.2, power: 0.8 }
stop: 2027-01-15
```

The arm split, effect and stop date above are examples. The loader sets the minimum sample from the
champion's measured variance, and refuses the file if the stop date comes too soon.

Slice 2 builds what this experiment needs: the router, the pay-per-token source adapter and the
live-bucket experiment path.

## To verify

Each of these needs a measurement before boxxy relies on it:

1. **How the pay-per-token provider reports billed cost per request.** The money unit rests on it.
2. **What Claude Code's OTel `cost_usd` shows for another vendor's model behind a proxy.** It is
   likely wrong, which is why boxxy takes cost from the provider.
3. **How a subscription window weighs cache reads.** Compare each day's window change with that
   day's OTel tokens.
4. **The unit and reader of another vendor's agent subscription.** Until this is known, that source
   has no reader and the router never picks it.
