<div align="center">
  <h1>@boxxy/closeout</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/closeout"><img src="https://img.shields.io/npm/v/@boxxy/closeout" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/design/boxxy/README.md">Documentation</a>
  </p>
</div>

boxxy's close-out parser. It checks the close-out an agent sends at the end of a build attempt, and
splits the work the agent found into new items to file and matches of items already open.

The package does no I/O: the caller passes in the item, the attempt's evidence rows and the open
items.

## Install

Install the package from [npm](https://www.npmjs.com/package/@boxxy/closeout) with Bun:

```bash
bun add @boxxy/closeout
```

The package runs on [Bun](https://bun.sh) 1.3 or newer.

## Features

- `buildCloseOutParser`, which returns the parsed close-out, or every problem with it in one pass
  ([the build close-out](../../docs/design/boxxy/slice-1.md#the-build-close-out)).
- `missingCriteria`, which lists the item's criteria that the close-out cites no evidence for.
- `dedupeOpenItems` and `normaliseTitle`, which match each open item the agent reports to an open
  item with the same title.

## Documentation

The [close-outs design](../../docs/design/boxxy/close-outs.md) says what a close-out holds and why,
and [`06-closeouts.ts`](../../docs/design/boxxy/sketches/06-closeouts.ts) gives the shapes.
