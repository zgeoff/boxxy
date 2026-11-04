# 0001: Claims live in the boxxy store

Date: 2026-11-04

## Decision

boxxy's own SQLite store writes every claim, and `decide()` runs inside the claim's write
transaction. The [dispatch design](../design/boxxy/dispatch.md) describes `claimNext`.

- A runner calls `claimNext`. The store opens the write transaction, reads its own observation
  boundary, runs `decide()`, and takes the item-phase lease and the pool's slot lease together.
- pepys stays a fact log and never claims. The store ships each event to pepys through an outbox.
- A standby process on the same store file follows, so that one dead process does not stop
  dispatch.

## Rejected alternatives

| Option                                             | Why not                                                                                                                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a claim primitive in pepys, with no separate store | pepys orders facts only within one stream, and the item lease and the slot lease span two streams, so "both or neither" needs a new cross-stream primitive |
| `decide()` reads pepys's read tables               | pepys has no read across consumer files                                                                                                                    |
| `decide()` before the transaction, then a claim    | a fact that lands between deciding and claiming is missed, which the planning bake-off's judge found as a fault                                            |

## Why

A claim is a policy decision over boxxy's own state, and it needs an atomic compare-and-set write
that pepys does not have. Deciding inside the transaction is cheap (measured, on a stub
`claimNext` over `bun:sqlite`): at 20,000 open items the lock is held 14 ms at p50 and 24 ms at
p99. At 60 claims a minute, 30 times the busiest measured 10 minutes, the lock is busy about 2% of
each minute. The cost of this choice is one store process, which the standby covers.
