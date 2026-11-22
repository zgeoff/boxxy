<div align="center">
  <h1>@boxxy/dispatch</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/dispatch"><img src="https://img.shields.io/npm/v/@boxxy/dispatch" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/architecture/overview.md">Documentation</a>
  </p>
</div>

boxxy's dispatch module, which claims the next task for an agent and settles each attempt.

boxxy calls a task an item. The package claims the next item for a free seat, binds the agent's
session to its attempt, and settles the attempt when the agent closes it out. It also sends the
owner's notices through the notifier port. It does no I/O: the caller passes in the store, the other
ports and the time. For the flow, read the [work pipeline](../../docs/architecture/work/pipeline.md)
and [attempts](../../docs/architecture/work/attempts.md) docs. The package's `./test-utils/*` entry
holds `createMemoryClaimStore`, the memory fake of the `ClaimStore` port, and `claimStoreContract`,
the cases that every `ClaimStore` must pass.

## Install

Install the package from [npm](https://www.npmjs.com/package/@boxxy/dispatch) with Bun:

```bash
bun add @boxxy/dispatch
```

The package runs on [Bun](https://bun.sh) 1.3 or newer.
