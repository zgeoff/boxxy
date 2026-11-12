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

**Status: v1 in progress.** The [v1 design](./docs/design/boxxy/v1.md) sets out the version under
build, and the [v1 work list](./docs/design/boxxy/v1-work-list.md) splits it into slices.

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

| Package                  | Folder                  | Holds                                              |
| ------------------------ | ----------------------- | -------------------------------------------------- |
| `@boxxy/cli`             | `apps/cli`              | the `boxxy` command line                           |
| `@boxxy/server`          | `apps/server`           | the API on two listeners, and the runner tick      |
| `@boxxy/dispatch`        | `modules/dispatch`      | claiming the next task, and settling each attempt  |
| `@boxxy/rules`           | `modules/rules`         | the rules loader and the rules version             |
| `@boxxy/closeout`        | `modules/closeout`      | the four phase kinds and the `openItems` dedupe    |
| `@boxxy/planning`        | `modules/planning`      | `buildFrame`, `decide` and the planning concepts   |
| `@boxxy/store-sqlite`    | `adapters/store-sqlite` | the store on SQLite                                |
| `@boxxy/model`           | `libs/model`            | the types the packages share, and the fact catalog |
| `@boxxy/content-hash`    | `libs/content-hash`     | canonical JSON and the SHA-256 content hashes      |
| `@boxxy/prompt-template` | `libs/prompt-template`  | the launch prompt's load check and Liquid render   |

Every package publishes to npm. The [releasing runbook](./docs/runbooks/releasing.md) covers a
release.

Run the local checks. CI runs the rest, with the type-aware lint, on every pull request:

```bash
bun install
bun run typecheck && bun run lint && bun run test
```

## Docs

- `docs/design/boxxy/`: the design docs. The [index](./docs/design/boxxy/README.md) lists them, and
  the [core model](./docs/design/boxxy/core-model.md) defines the terms.
- `docs/decisions/`: the decision records, numbered in the order they were made.
- `docs/runbooks/`: the maintainer steps the tooling doesn't do, such as a package's first publish.

## License

MIT. See [LICENSE](./LICENSE).
