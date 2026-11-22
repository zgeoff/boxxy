<div align="center">
  <h1>@boxxy/review-noslop</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/review-noslop"><img src="https://img.shields.io/npm/v/@boxxy/review-noslop" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/architecture/overview.md">Documentation</a>
  </p>
</div>

boxxy's `ReviewGate` port on noslop. It gives the command a review session runs, and on the server
it posts that session's result and checks it.

## Install

Install the package from [npm](https://www.npmjs.com/package/@boxxy/review-noslop) with Bun:

```bash
bun add @boxxy/review-noslop
```

The package runs on [Bun](https://bun.sh) 1.3 or newer.

## Features

- `createNoslopReviewGate({ appEnv })` returns a `ReviewGate`. `appEnv` holds the noslop App's keys,
  which only the server has.
- `buildCommand(round)` gives a command that writes `noslop-review.json` in the pull request's
  checkout. In the first round the command runs a full review. In a later round it runs
  `--fixes-only`, then a plain review when that run judged no fix and `noslop findings` succeeds.
- `accept(round, result)` posts the result with `sendResult` from `@noslop/cli/post`, then reads the
  findings still open with `check` from `@noslop/cli/check`.
- When `accept` can't post a result, such as one for an old head, it reads the result as
  `not-covered` and posts nothing.
- A fixes-only run that judged no fix reaches `accept` only when `noslop findings` failed, so the
  command ran no plain review. That result reads `not-covered` too, and the reading's `reason` holds
  noslop's error, such as a missing `github.app`.
- `accept` throws only when GitHub gives no answer. On a throw, the session sends the file again.

## Documentation

Read [The review gate](../../docs/design/boxxy/review-and-merge.md#the-review-gate) for each reading
and for when the core sends a pull request back.
