<div align="center">
  <h1>@boxxy/verifier-wringer</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/verifier-wringer"><img src="https://img.shields.io/npm/v/@boxxy/verifier-wringer" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/design/boxxy/README.md">Documentation</a>
  </p>
</div>

boxxy's `Verifier` port on wringer: it reads the verify gate check at a pull request's head and the
wringer report in the pull request's body.

## Install

Install the package from [npm](https://www.npmjs.com/package/@boxxy/verifier-wringer) with Bun:

```bash
bun add @boxxy/verifier-wringer
```

The package runs on [Bun](https://bun.sh) 1.3 or newer.

## Features

- `createWringerVerifier({ forge, gateCheck })` returns a `Verifier`. The app passes its forge and
  the name of the gate check, such as `verify / gate`.
- `readAt(pullRequest, head)` reads the latest run of the gate check at `head`. A passed gate reads
  `verified` and a failed gate reads `incomplete`, each with the features of the report.
- A head with no gate check run, or one still running, cancelled or skipped, reads `not-covered`.
  The adapter then never reads the body. A commit status of the gate's name never counts.
- A finished gate with no report in the body, or a report that does not parse, reads `incomplete`
  with no features.
- The adapter does no I/O of its own. It reads the forge, and parses the report with wringer's
  `parseReportBlock`.

## Documentation

[The verifier](../../docs/design/boxxy/review-and-merge.md#the-verifier) describes how the verdict
reaches the merge.
