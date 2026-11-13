<div align="center">
  <h1>@boxxy/train</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/train"><img src="https://img.shields.io/npm/v/@boxxy/train" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/design/boxxy/README.md">Documentation</a>
  </p>
</div>

boxxy's merge rule, `decideMerge`, which decides what the boxxy server does next with a pull request
that is ready to merge. The server reads the pull request and calls `decideMerge` with what it read.
`decideMerge` returns one of three answers, and the server acts on it:

- finish the merge attempt with an outcome, such as `merged` when the pull request has merged, or
  `repair` when a required check failed;
- wait, and read the pull request again later;
- merge the pull request at the head commit the server read.

The server merges only when boxxy's review passed, every required check passed and the verify gate
passed, all at that head commit. The package does no I/O: the server passes in what it read, the
merge rules, the time, and the last merge it asked for, so that `decideMerge` does not ask again too
soon.

The package is named for the merge train, a later rule that would merge several pull requests at
once. Its [design](../../docs/design/boxxy/merge-train.md) is not built.

## Install

Install the package from [npm](https://www.npmjs.com/package/@boxxy/train) with Bun:

```bash
bun add @boxxy/train
```

The package runs on [Bun](https://bun.sh) 1.3 or newer.

## Documentation

[The merge step](../../docs/design/boxxy/review-and-merge.md#the-merge-step) holds the table of
cases that `decideMerge` checks in order, each outcome, and what the server reads and how often.
