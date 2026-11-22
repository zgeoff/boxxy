<div align="center">
  <h1>boxxy</h1>

  <p>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="./docs/architecture/overview.md">Architecture</a> •
    <a href="./docs/design/boxxy/README.md">Design docs</a>
  </p>
</div>

Decides which task a fleet of coding agents works on next, and measures what each task costs in
tokens and money.

## What boxxy does

1. You file a task in boxxy.
2. boxxy picks the next task to run. YAML rules files in a git repo set the order: which tasks go
   first, how many run at once, and which tasks wait.
3. boxxy starts a coding agent on the task, through [atc](https://github.com/zgeoff/atc).
4. boxxy records what happened: the commits, the pull request, the tokens spent and the result.

boxxy stores those records in [pepys](https://github.com/zgeoff/pepys), an event store. You can then
compare models, prompts and rules on the same kind of task.

## Workspace

boxxy is one [Bun](https://bun.sh) workspace. See the [layout](./docs/architecture/repo/layout.md)
for which folder holds what, and which package may import which.

| Package                   | Folder                      | Holds                                                    |
| ------------------------- | --------------------------- | -------------------------------------------------------- |
| `@boxxy/cli`              | `apps/cli`                  | the `boxxy` command line                                 |
| `@boxxy/server`           | `apps/server`               | the API on two listeners, and the runner tick            |
| `@boxxy/dispatch`         | `modules/dispatch`          | claiming the next task, and settling each attempt        |
| `@boxxy/rules`            | `modules/rules`             | the rules loader and the rules version                   |
| `@boxxy/closeout`         | `modules/closeout`          | the phase kinds and the `openItems` dedupe               |
| `@boxxy/planning`         | `modules/planning`          | `buildFrame`, `decide` and the planning concepts         |
| `@boxxy/train`            | `modules/train`             | `decideMerge`, the merge rule                            |
| `@boxxy/store-sqlite`     | `adapters/store-sqlite`     | the store on SQLite                                      |
| `@boxxy/auth-oauth`       | `adapters/auth-oauth`       | the public door to the owner's MCP tools, with OAuth     |
| `@boxxy/caller-proof-imp` | `adapters/caller-proof-imp` | the proof of which machine sent a call, from imp         |
| `@boxxy/forge-github`     | `adapters/forge-github`     | pull requests, commits and checks on GitHub              |
| `@boxxy/notifier-atc`     | `adapters/notifier-atc`     | the owner's hold notices, as atc messages                |
| `@boxxy/review-noslop`    | `adapters/review-noslop`    | the review gate on noslop                                |
| `@boxxy/verifier-wringer` | `adapters/verifier-wringer` | the verify gate on wringer                               |
| `@boxxy/worker-atc`       | `adapters/worker-atc`       | the agent sessions, on atc                               |
| `@boxxy/model`            | `libs/model`                | the types the packages share, and the fact catalog       |
| `@boxxy/contract`         | `libs/contract`             | the API's oRPC contract, and who may call each procedure |
| `@boxxy/content-hash`     | `libs/content-hash`         | canonical JSON and the SHA-256 content hashes            |
| `@boxxy/prompt-template`  | `libs/prompt-template`      | the launch prompt's load check and Liquid render         |
| `@boxxy/pepys`            | `packages/pepys`            | the pepys plug-in: boxxy's fact sink and reader          |

Every package publishes to npm. To cut a release, follow the
[releasing runbook](./docs/runbooks/releasing.md).

CI runs these checks on every pull request, along with the audit, the dead-code check, the
type-aware lint and the docs checks. Run them locally:

```bash
bun install
bun run typecheck && bun run lint && bun run test
```

## Docs

- `docs/architecture/`: how the built system works. Start at the
  [overview](./docs/architecture/overview.md).
- `docs/design/boxxy/`: the designs for work not yet built. Start at the
  [index](./docs/design/boxxy/README.md), and look up a term in the
  [core model](./docs/design/boxxy/core-model.md).
- `docs/decisions/`: the decision records, numbered in the order they were made.
- `docs/runbooks/`: the maintainer steps the tooling doesn't do, such as a package's first publish.

## License

MIT. See [LICENSE](./LICENSE).
