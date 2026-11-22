<div align="center">
  <h1>@boxxy/planning</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/planning"><img src="https://img.shields.io/npm/v/@boxxy/planning" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/architecture/overview.md">Documentation</a>
  </p>
</div>

boxxy's planning module. `buildFrame` runs the plug-ins of the loaded rules over a snapshot of the
open items, and `decide` picks the wakes and the item phases that start, while each limit has a free
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
  values, and each plug-in fault ([planning](../../docs/architecture/work/planning.md)).
- `decide`, which puts each wake first, then picks pool by pool while each limit that counts a pick
  has a free seat. It returns the reason for each item and wake it passes over. It reads the pools
  and their order from the frame, so it never names a concept
  ([planning: limits and the decision](../../docs/design/boxxy/planning.md#limits-and-the-decision)).
- `concepts`, the `pool`, `defer` and `expedite` concepts
  ([signals and propagation](../../docs/architecture/work/planning.md#signals-and-propagation)).
- `conceptPins`, each concept's pin, which the build generates from the concept's source
  ([rules](../../docs/architecture/overview.md#rules)).

## Documentation

Read the [planning design](../../docs/design/boxxy/planning.md) for why concepts are plug-ins, and
[`04-planning.ts`](../../docs/design/boxxy/sketches/04-planning.ts) for the shapes.
