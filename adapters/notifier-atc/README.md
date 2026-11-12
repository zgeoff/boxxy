<div align="center">
  <h1>@boxxy/notifier-atc</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/notifier-atc"><img src="https://img.shields.io/npm/v/@boxxy/notifier-atc" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/design/boxxy/README.md">Documentation</a>
  </p>
</div>

boxxy's `Notifier` port on atc: a hold notice arrives as one atc message in one named session.

## Install

Install the package from [npm](https://www.npmjs.com/package/@boxxy/notifier-atc) with Bun:

```bash
bun add @boxxy/notifier-atc
```

The package runs on [Bun](https://bun.sh) 1.3 or newer.

## Features

- `createAtcNotifier({ client, session })` returns a `Notifier`. The message names the item and the
  reason, and says the owner next runs `boxxy item note` and `boxxy item retry`.
- The client is one call, `sendMessage`. The app builds it from its atc connection.
- The adapter sends the key it gets from the notice as the idempotency key, and keeps no state.
- A send that atc refuses with a code that ran nothing returns `refused`. Every other failure
  returns `uncertain`. The adapter never throws.
  [Notice delivery in production](../../docs/design/boxxy/owner-notices.md) lists the codes and says
  what the server does with each outcome.

## Documentation

[Notices in v1](../../docs/design/boxxy/v1.md#notices) describes when a notice is written and sent.
