<div align="center">
  <h1>@boxxy/store-sqlite</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/store-sqlite"><img src="https://img.shields.io/npm/v/@boxxy/store-sqlite" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/design/boxxy/README.md">Documentation</a>
  </p>
</div>

boxxy's store on SQLite: the schema, the migrations and the transactions behind the `ClaimStore`
port.

`createSQLiteClaimStore(path)` opens one SQLite file, creates it when it's missing, runs the
migrations the file hasn't run, and returns the store with a `close` function.

## Install

Install the package from [npm](https://www.npmjs.com/package/@boxxy/store-sqlite) with Bun:

```bash
bun add @boxxy/store-sqlite
```

The package runs on [Bun](https://bun.sh) 1.3 or newer.

## Features

- Items, levers, attempts, leases, limit seats, notes, notices and the outbox in one file, with each
  change applied whole or not at all
  ([one write path](../../docs/design/boxxy/slice-1.md#one-write-path)).
- `exclusive` calls that run one at a time in a `BEGIN IMMEDIATE` transaction, and `read` calls that
  see the last commit ([store rules](../../docs/design/boxxy/slice-1.md#store-rules)).
- Each item's position and state derived on each read, from the rows and the loaded rules
  ([v1](../../docs/design/boxxy/v1.md)).

## Documentation

The [v1 tables migration](./src/migrations/v1-tables-migration.ts) creates each table, and the store
section of [`02-types.ts`](../../docs/design/boxxy/sketches/v1/core/02-types.ts) gives the port, the
seat take and the seat sync.
