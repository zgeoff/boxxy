<div align="center">
  <h1>@boxxy/contract</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/contract"><img src="https://img.shields.io/npm/v/@boxxy/contract" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/design/boxxy/README.md">Documentation</a>
  </p>
</div>

The oRPC contract of the boxxy API, and the table of who may call each procedure.

The server builds its router from the contract, and the CLI builds its typed client from it. The
package does no I/O: it holds only the procedures and their zod schemas.

## Install

Install the package from [npm](https://www.npmjs.com/package/@boxxy/contract) with Bun:

```bash
bun add @boxxy/contract
```

The package runs on [Bun](https://bun.sh) 1.3 or newer.

## Features

- `contract`, the 26 procedures in the groups `item`, `relation`, `attempt`, `plan`, `runner`,
  `outbox`, `rules` and `report`. A procedure that is an MCP tool carries its tool name and
  description.
- `access`, one row for each procedure: who calls it, the actor its fact records, the MCP endpoint
  that lists it, and the CLI command that calls it.

## Documentation

[API and auth in v1](../../docs/design/boxxy/v1-api-and-auth.md) describes the three doors, the
procedures and the scope of the worker token.
