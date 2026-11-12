<div align="center">
  <h1>@boxxy/review-noslop</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/review-noslop"><img src="https://img.shields.io/npm/v/@boxxy/review-noslop" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/design/boxxy/README.md">Documentation</a>
  </p>
</div>

boxxy's `ReviewGate` port on noslop: the command a review session runs, and the server's check and
post of its result.

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
  checkout. A first round runs a full review. A later round runs `--fixes-only`, and runs a plain
  review when that run judged no fix.
- `accept(round, result)` posts the result with `sendResult` from `@noslop/cli/post`, then reads the
  findings still open with `check` from `@noslop/cli/check`.
- `accept` reads a result that it can't post as `not-covered` and posts nothing. That covers a
  result for an old head and a fixes-only run that judged no fix.
- `accept` throws only when GitHub gives no answer, so the session sends the file again.

## Documentation

[The review gate](../../docs/design/boxxy/review-and-merge.md#the-review-gate) describes each
reading and when the core sends a pull request back.
