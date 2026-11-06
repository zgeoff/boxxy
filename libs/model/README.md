<div align="center">
  <h1>@boxxy/model</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/model"><img src="https://img.shields.io/npm/v/@boxxy/model" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/design/boxxy/README.md">Documentation</a>
  </p>
</div>

The types that boxxy's packages share, with the fact catalog and its schemas.

Every boxxy package that reads or writes a store row, a fact or a port imports its types from here.
The package does no I/O: it takes the time as an argument, and it holds only types, zod schemas and
pure functions.

## Install

Install the package from [npm](https://www.npmjs.com/package/@boxxy/model) with Bun:

```bash
bun add @boxxy/model
```

The package runs on [Bun](https://bun.sh) 1.3 or newer.

## Features

- The branded ids and names, with a zod schema for each in `brandSchemas`.
- The store rows, the port interfaces, the plug-in interfaces and the loaded rules.
- The fact catalog, with a zod schema for each fact type's payload in `factSchemas`
  ([facts and the outbox](../../docs/design/boxxy/slice-1.md#facts-and-the-outbox)).
- `BuildCloseOut` and its schema, `buildCloseOutSchema`
  ([the build close-out](../../docs/design/boxxy/slice-1.md#the-build-close-out)).
- `deriveItemState`, which derives an item's state from its rows
  ([derived item state](../../docs/design/boxxy/slice-1.md#derived-item-state)).
- `liveLevers`, which drops the levers a later undo lever cancels and those past their expiry.
- `signalKey`, which builds a signal's key from its name and the content hash of its parameters.
- `defineSignal`, `defineGate` and `defineAdmission`, which register a plug-in with its parameter
  type hidden.

## Documentation

The [boxxy design docs](../../docs/design/boxxy/README.md) describe each type, and the
[interface sketches](../../docs/design/boxxy/sketches/README.md) give its shape.
