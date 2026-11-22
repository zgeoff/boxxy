<div align="center">
  <h1>@boxxy/train</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/train"><img src="https://img.shields.io/npm/v/@boxxy/train" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/architecture/overview.md">Documentation</a>
  </p>
</div>

`decideMerge` is boxxy's merge rule. At the merge step of an item's pipeline, the boxxy server reads
the item's pull request, calls `decideMerge` with what it read, and acts on one of three answers:

- finish the merge attempt with an outcome, such as `merged` when the pull request has merged, or
  `repair` when a required check failed;
- wait, and read the pull request again later;
- merge the pull request at the head commit the server read.

The server merges only when boxxy's review and every required check of the base branch passed at
that head commit. The package does no I/O. The server passes in what it read, the merge rules, the
time, and the last merge it asked for, and `decideMerge` uses that last merge to avoid asking again
too soon.

The package is named for the merge train, a later rule that would merge several pull requests at
once. The merge train's [design](../../docs/design/boxxy/merge-train.md) is not built.

## Install

Install the package from [npm](https://www.npmjs.com/package/@boxxy/train) with Bun:

```bash
bun add @boxxy/train
```

The package runs on [Bun](https://bun.sh) 1.3 or newer.

## Documentation

For the table of cases that `decideMerge` checks in order, each outcome, and what the server reads
and how often, see [The merge step](../../docs/design/boxxy/review-and-merge.md#the-merge-step).
