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

boxxy's phase kinds: triage, design, build and review. Each one gives the input of an attempt,
checks the close-out the agent sends at the end of it, and settles the attempt from that close-out.

The package does no I/O: the caller passes in the item, its attempts, the attempt's evidence rows
and what a close-out may name.

## Install

Install the package from [npm](https://www.npmjs.com/package/@boxxy/closeout) with Bun:

```bash
bun add @boxxy/closeout
```

The package runs on [Bun](https://bun.sh) 1.3 or newer.

## Features

- `triage`, `design`, `build` and `review`, the four phase kinds, and `phaseKinds`, which lists them
  for the rules loader. Each parser returns the stored close-out, or every problem with it in one
  pass.
- `closeOutLimits`, the byte limits of a close-out, and `measureJsonBytes`, which measures a value
  as stored.
- `dedupeOpenItems`, which matches each open item the agent reports to an open item with the same
  title.

## Documentation

The [close-outs design](../../docs/design/boxxy/close-outs.md#the-v1-phase-kinds) says what each
phase kind checks and settles, and
[`02-types.ts`](../../docs/design/boxxy/sketches/v1/core/02-types.ts) gives the shapes.
