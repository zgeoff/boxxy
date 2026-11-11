<div align="center">
  <h1>@boxxy/planning</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/planning"><img src="https://img.shields.io/npm/v/@boxxy/planning" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/design/boxxy/README.md">Documentation</a>
  </p>
</div>

boxxy's planning. `buildFrame` runs the plug-ins of the loaded rules over a snapshot of the open
items, and `decide` picks the wakes and the item phases that start, while each limit has a free
seat.

The package does no I/O: the caller passes in the snapshot, the loaded rules and the time.

## Install

Install the package from [npm](https://www.npmjs.com/package/@boxxy/planning) with Bun:

```bash
bun add @boxxy/planning
```

The package runs on [Bun](https://bun.sh) 1.3 or newer.

## Features

- `buildFrame`, which returns the candidates, their holds, lifts, signal values and filter-field
  values, and each plug-in fault
  ([planning: buildFrame and decide](../../docs/design/boxxy/slice-1.md#planning-buildframe-and-decide)).
- `decide`, which puts each wake first, then picks pool by pool while each limit that counts a pick
  has a free seat, gives the reason for each item and wake it passes over, and never names a concept
  ([planning: limits and the decision](../../docs/design/boxxy/planning.md#limits-and-the-decision)).
- `concepts`, the `pool`, `defer` and `expedite` concepts
  ([the slice 1 concepts](../../docs/design/boxxy/slice-1.md#the-slice-1-concepts)).
- `conceptPins`, each concept's pin, which the build generates from the concept's source
  ([rules for slice 1](../../docs/design/boxxy/slice-1.md#rules-for-slice-1)).

## Documentation

The [planning design](../../docs/design/boxxy/planning.md) says why concepts are plug-ins, and
[`04-planning.ts`](../../docs/design/boxxy/sketches/04-planning.ts) gives the shapes.
