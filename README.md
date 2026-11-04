<div align="center">
  <h1>boxxy</h1>

  <p>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="./docs/design/boxxy/README.md">Design docs</a> •
    <a href="./docs/design/boxxy/slice-1.md">First build spec</a>
  </p>
</div>

Decides which task a fleet of coding agents works on next, and measures what each task costs in
tokens and money.

**Status: workspace set up, no features yet.** Each package is a placeholder. The
[first build spec](./docs/design/boxxy/slice-1.md) sets out the first working version, which the
design calls slice 1.

## What boxxy does

1. You file a task in boxxy.
2. boxxy picks the next task to run. YAML rules files in a git repo set the order: which tasks go
   first, how many run at once, and which tasks wait.
3. boxxy starts a coding agent on the task, through [atc](https://github.com/zgeoff/atc).
4. boxxy records what happened: the commits, the pull request, the tokens spent and the result.

boxxy stores those records in [pepys](https://github.com/zgeoff/pepys), an event store. You can then
compare models, prompts and rules on the same kind of task.

## Workspace

boxxy is one [Bun](https://bun.sh) workspace. The [layout](./docs/design/boxxy/layout.md) sets which
folder holds what, and which package may import which.

| Package               | Folder                  | Holds                                                 |
| --------------------- | ----------------------- | ----------------------------------------------------- |
| `@boxxy/cli`          | `apps/cli`              | the `boxxy` command line                              |
| `@boxxy/dispatch`     | `modules/dispatch`      | claiming the next task, and settling each attempt     |
| `@boxxy/store-sqlite` | `adapters/store-sqlite` | the store on SQLite                                   |
| `@boxxy/model`        | `libs/model`            | the types the packages share, and the fact catalog    |
| `@boxxy/test-utils`   | `test-utils`            | test helpers that two or more packages share; private |
| `@boxxy/e2e`          | `e2e`                   | the end-to-end tests; private                         |

Every package outside `test-utils` and `e2e` publishes to npm. The
[releasing runbook](./docs/runbooks/releasing.md) covers a release.

Run the checks that CI runs:

```bash
bun install
bun run check
```

## Docs

- `docs/design/boxxy/`: the design docs. The [index](./docs/design/boxxy/README.md) lists them, and
  the [core model](./docs/design/boxxy/core-model.md) defines the terms.
- `docs/decisions/`: the decision records, numbered in the order they were made.
- `docs/runbooks/`: the maintainer steps the tooling doesn't do, such as a package's first publish.

## License

MIT. See [LICENSE](./LICENSE).
