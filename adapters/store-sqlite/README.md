<div align="center">
  <h1>@boxxy/store-sqlite</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/store-sqlite"><img src="https://img.shields.io/npm/v/@boxxy/store-sqlite" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/architecture/overview.md">Documentation</a>
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
  ([one change at a time](../../docs/architecture/work/store.md#one-change-at-a-time)).
- `exclusive` calls that run one at a time in a `BEGIN IMMEDIATE` transaction, and `read` calls that
  see the last commit ([SQLite settings](../../docs/architecture/work/store.md#sqlite-settings)).
- Each item's position and state derived on each read, from the rows and the loaded rules
  ([the pipeline](../../docs/architecture/work/pipeline.md)).

## Documentation

To see each table, read the [v1 tables migration](./src/migrations/v1-tables-migration.ts). To see
the `ClaimStore` port, the seat take and the seat sync, read `@boxxy/model`.
