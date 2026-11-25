# Planning

On each claim, the planning core, the `@boxxy/planning` module, chooses which item to start next. It
reads the open items and the owner's levers, and returns one pick for each free seat. For claim,
item, lever, pool and seat, see [Terms](../overview.md#terms). For how a pool and a limit work, see
[limits and pools](./pipeline.md#limits-and-pools).

## The words the core uses

The rules file holds the planning concepts that the core runs, and the
[work pipeline](./pipeline.md) doc describes that file. Each concept adds some of these parts:

| Part         | What it does                                                                        |
| ------------ | ----------------------------------------------------------------------------------- |
| gate         | holds an item, so the claim never starts it                                         |
| waiver       | lifts a hold that a gate set                                                        |
| signal       | gives an item a value, such as a defer date or an expedite position                 |
| propagation  | carries a signal's value along one kind of relation between items, such as `blocks` |
| filter field | gives an item a value that a pool's filter matches against                          |

A ready item is an open item whose phase can start and that no gate holds. A candidate is a ready
item that the core may pick.

## Signals and propagation

The core reads every open item, ready or not, and picks only from the candidates. Propagation starts
at every item that has a value, follows the relation set in its propagation rule, and stops at an
item it has visited. When an item receives several values, the signal's `combine` function merges
them. When the owner expedites a blocked item, propagation moves its blockers forward too.

The owner sets the `defer` and `expedite` levers:

- `defer` feeds the `defer` gate, which holds the item until the lever's `until` time, or until the
  owner undefers it when the lever has no `until`. When an item has several live `defer` levers, the
  one the store recorded last counts.
- `expedite` feeds the `expedite` signal, which gives an item its position among all `expedite`
  levers, in the order the store recorded them. An item with two `expedite` levers takes the earlier
  position, so its `combine` is `min`.

The `expedite-lifts-defer` waiver lifts a defer hold on any item with an `expedite` value, including
a value that propagation brought it.

## Faults

When a concept throws on one item, the core records a fault on that item and goes on with the
others, so a bug in one concept never stops every claim:

- When a gate throws, the core holds the item with the fault as the hold's reason, and no waiver
  lifts that hold.
- When a waiver throws, it lifts nothing. When a signal throws, the item gets no value from it.
- When a filter field throws, the item gets no value for that field, so it matches no pool.
- When a propagation step throws, the items keep the values they held before that step.

## The pick

The core offers each candidate to the pools in the order the rules file declares them, and the first
pool whose filter matches takes it. Inside a pool, a candidate with no value for the pool's signal
sorts after every candidate with one, and a tie breaks by item id.
