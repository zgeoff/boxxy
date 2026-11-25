<div align="center">
  <h1>@boxxy/notifier-atc</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/notifier-atc"><img src="https://img.shields.io/npm/v/@boxxy/notifier-atc" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/architecture/overview.md">Documentation</a>
  </p>
</div>

`@boxxy/notifier-atc` implements boxxy's `Notifier` port on atc. It sends each hold notice as one
atc message to one session, which the caller names by its atc gateway ID on each notice.

## Install

Install the package from [npm](https://www.npmjs.com/package/@boxxy/notifier-atc) with Bun:

```bash
bun add @boxxy/notifier-atc
```

The package runs on [Bun](https://bun.sh) 1.3 or newer.

## Features

- `createAtcNotifier({ client, readSession })` returns a `Notifier`. Each message holds the item,
  the reason, and the two commands the owner runs next: `boxxy item note` and `boxxy item retry`.
- The adapter calls `readSession` for the session's gateway ID on each notice, so a change of
  session takes effect on the next notice. With no session, it sends nothing and returns `refused`
  with the reason `no-notice-session`.
- The client is one call, `sendMessage`. The app builds it from its atc connection.
- The adapter sends the key it gets from the notice as the idempotency key, and keeps no state.
- When atc refuses a send with a code that means nothing ran, the adapter returns `refused`. On
  every other failure, apart from the missing session, it returns `uncertain`. The adapter never
  throws. For the codes, and what the server does with each outcome, see
  [Notice delivery](../../docs/architecture/work/notices.md).

## Documentation

For when a notice is written and sent, see
[Notices in v1](../../docs/architecture/work/pipeline.md#when-an-item-needs-the-owner).
