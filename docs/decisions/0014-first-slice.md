# 0014: The first slice

Date: 2026-11-04 Updated: 2026-11-05

## Decision

Slice 1 builds the smallest boxxy that dispatches real build work and answers one cost question. The
[slice 1 design](../design/boxxy/slice-1.md) specifies it.

- **In:** one item kind, the build phase and one pool; the boxxy store with claims (see
  [0001](./0001-claims-live-in-the-boxxy-store.md)) and three plug-ins: a pool, defer with expedite
  as its waiver, and expedite propagation (see [0004](./0004-planning-concepts-are-plug-ins.md));
  the build worker through atc; the join from telemetry to attempts by agent session id (see
  [0007](./0007-spend-capture-through-otel.md)); the build close-out; PR and commit links; one pepys
  consumer and one query: cost to land per item, by model.
- **Out:** the merge train, the router, the pacing gate, experiments and the forecast. The older
  tool's merge gate keeps merging.
- **Trial:** boxxy dispatches work for the pepys repo only, beside the older tool.
- **Slice 2:** the router, a pay-per-token provider's capacity source, and the first live-bucket
  experiment, which evaluates a model from that provider.

## Rejected alternatives

| Option                                                             | Why not                                                                                                    |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| the merge train in slice 1                                         | the current merge gate keeps merging, and the train needs a CI fact family in pepys first                  |
| experiments in slice 1                                             | an experiment needs cost to land per item, which slice 1 builds first                                      |
| a forecast, roadmap or deadline in slice 1                         | nothing in slice 1 needs them, and the plug-in registry adds them later with no change to its interface    |
| a trial on boxxy's own repo                                        | a boxxy fault would stall work on boxxy itself                                                             |
| one pepys consumer reading both the work and the telemetry streams | pepys gives each stream one entity consumer; a query across consumer files attaches them read-only instead |

## Why

Slice 1 proves the parts that everything else rests on: an atomic claim, the plug-in interface
tested by three concepts of different shapes, attempts with recipes and close-outs, and spend joined
to an attempt. Cost to land per item, by model, is the first answer that the measurement work needs.
Running beside the older tool on one repo keeps a boxxy fault from blocking the fleet.
