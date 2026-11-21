# Planning

Each claim asks the planning core, the `@boxxy/planning` module, which item to start next. The core
reads the open items and the owner's levers, and returns one pick for each free seat.
[Terms](../overview.md#terms) defines claim, item, lever, pool and seat, and
[limits and pools](./pipeline.md#limits-and-pools) says how a pool and a limit work.

## The words the core uses

The rules file names the planning concepts the core runs. Each concept adds some of these parts:

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
at every item that has a value, follows the relation that its propagation rule names, and stops at
an item it has visited. When an item receives several values, the signal's `combine` function merges
them. So when the owner expedites a blocked item, its blockers move forward too.

The owner sets two levers, and each one feeds a signal:

- `defer` holds an item until the lever's `until` time. When an item has several live `defer`
  levers, the latest one counts.
- `expedite` gives an item its position among all `expedite` levers, in the order the store recorded
  them. An item with two `expedite` levers takes the earlier position, so its `combine` is `min`.

The `expedite-lifts-defer` waiver lifts a defer hold on any item with an `expedite` value, including
a value that propagation brought it.

## Faults

When a concept throws on one item, the core records a fault on that item and goes on with the
others:

- A gate that throws holds the item, with the fault as the hold's reason, and a waiver never lifts
  that hold.
- A waiver that throws lifts nothing, and a signal that throws gives the item no value.
- A filter field that throws gives no value, so the item matches no pool.
- A propagation step that throws leaves the values the items held before that step.

## The pick

The core offers each candidate to the pools in the order the rules file declares them, and the first
pool whose filter matches takes it. Inside a pool, a candidate with no value for the pool's signal
sorts after every candidate with one, and a tie breaks by item id.
