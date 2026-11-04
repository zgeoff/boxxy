# 0004: Planning concepts are plug-ins

Date: 2026-11-04 Updated: 2026-11-05

## Decision

Ordering is built from plug-in concepts. The [planning design](../design/boxxy/planning.md) defines
each plug-in kind.

- A concept is one module that registers its item kinds, link types, fact kinds, commands, and its
  plug-ins: signals, gates, pool gates, waivers, admissions and views. A propagation line is rules
  data, and `buildFrame()` runs it.
- `buildFrame()` runs the plug-ins and builds one frame. `decide()` reads the frame and the pools,
  and never names a concept.
- A plug-in that throws fails toward holding: a failed gate holds the item, and a failed waiver or
  admission grants nothing.
- boxxy builds the concepts the system needs, with no fixed count. It builds first the few whose
  shapes differ most: a pool, defer as a gate with expedite as its waiver, and expedite propagation
  over links. They test the plug-in interface before many plug-ins depend on it.

## Rejected alternatives

| Option                                                                                                | Why not                                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| the smallest sketch: three planning facts and one `serves` link, each concept written into `decide()` | each new ordering idea changes a union type and `decide()`                                                                    |
| the sketch that followed existing patterns: first-match pools and keys in one rules file              | it scored lower; its one transaction for decide and claim was borrowed (see [0001](./0001-claims-live-in-the-boxxy-store.md)) |
| a fixed list of concepts, built up front                                                              | it builds concepts before anything needs them                                                                                 |
| a failed gate holds nothing                                                                           | a gate fault would let blocked work run                                                                                       |

## Why

Three sketches, each from a different approach, were scored blind by two judges from different model
families on five criteria: the owner's override always wins, one policy change touches one place, a
forecast you can trust, one ordering function, and a small first slice. The plug-in design won on
the combined score, 31 against 29 and 28. It is also the heaviest of the three, and a wrong plug-in
interface is costly because everything rests on it. Building the most different shapes first tests
that interface while it is still cheap to change.
