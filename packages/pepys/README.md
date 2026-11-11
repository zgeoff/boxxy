<div align="center">
  <h1>@boxxy/pepys</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/pepys"><img src="https://img.shields.io/npm/v/@boxxy/pepys" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/design/boxxy/v1-facts-and-pepys.md">Documentation</a>
  </p>
</div>

The pepys plug-in of boxxy, with the fact sink that sends boxxy's facts to pepys and the reader that
asks pepys for boxxy's two reports.

A pepys deployment lists the plug-in, and the boxxy server builds the sink and the reader. The
plug-in folds boxxy's facts into the `boxxy_work` tables and answers two queries: what an item cost
to land, and how long it spent in each step.

## Install

Install the package and the pepys kit it plugs into from
[npm](https://www.npmjs.com/package/@boxxy/pepys) with Bun:

```bash
bun add @boxxy/pepys @pepys/kit zod
```

`@pepys/kit` and `zod` are peer dependencies: the deployment's own copy is the one the plug-in uses.
The package runs on [Bun](https://bun.sh) 1.3 or newer.

## Features

- `@boxxy/pepys`: the plug-in parts, `boxxySource`, `boxxyWorkConsumer` and `buildBoxxyPlugin`, and
  the query types.
- `@boxxy/pepys/sink`: `createPepysFactSink`, the `FactSink` that sends a batch of facts to pepys
  ingest.
- `@boxxy/pepys/reader`: `createPepysReader`, the `PepysReader` that runs the two queries.

## Documentation

[Facts and pepys in v1](../../docs/design/boxxy/v1-facts-and-pepys.md) describes the outbox, the
fact catalog, the `boxxy_work` package and the two queries.
