# Working in boxxy

boxxy decides which task a fleet of coding agents works on next, and measures what each task costs.
Your job here is one change, from one task. Build what the task and its design doc specify, and
keep the docs true: describe what you built in the architecture docs, and rewrite each sentence that
your change makes false. Hand back an open pull request with green CI: watch its checks after each
push, and fix each failure. Don't merge it: the repo owner merges every pull request.

The mistakes that cost most here:

- code in a package that the [layout](docs/architecture/repo/layout.md) doesn't allow;
- a behaviour change with no change to the doc that describes the behaviour;
- anything private pushed to this public repo.

## Key rules

- [Before you start](#before-you-start): read the architecture docs your change touches and the
  design doc for your task, and load the skills your work needs.
- [Layout](#layout): follow the layout doc. Code under `modules/` and `libs/` does no I/O.
- [Docs and decisions](#docs-and-decisions): a doc changes in the same PR as the code.
- [Verify before you hand off](#verify-before-you-hand-off): check each feature your change touches
  with the `verify` skill, and publish the verify report to the pull request.
- [Packages](#packages): one exact version per dependency, in the root catalog.
- [Checks](#checks): run the local checks before you push. The type-aware lint runs in CI only.
- [Commits and pull requests](#commits-and-pull-requests): Conventional Commits, one PR per
  change, no attribution lines.
- [Public repo](#public-repo): nothing from your machine or anyone's private setup.

## Before you start

- Read the [architecture overview](docs/architecture/overview.md), then the architecture doc of
  each part your change touches. They describe the system as it is built.
- When your task builds a design, read the design doc it names, and each doc that doc links. When
  the task names none, find the doc by its subject in the
  [design index](docs/design/boxxy/README.md). When the index has none, build from the task alone,
  and say so in the PR description. The [core model](docs/design/boxxy/core-model.md) defines the
  terms of the designs.
- When the task names a pull request or an issue it depends on, check with `gh` that the pull
  request has merged, or that the issue is closed as completed. When it isn't, stop: open no pull
  request, and name that work in your reply.
- Load the skill for the work before you start it. The skills are in `.agents/skills/`, and
  `.claude/skills` links to that folder:

  | Skill                               | Load before                                                   |
  | ----------------------------------- | ------------------------------------------------------------- |
  | `docs-writing`                      | writing or editing any committed prose, a design doc included |
  | `code-style`                        | writing, reviewing or renaming code                           |
  | `testing` and `project-testing`     | writing or reviewing a test                                   |
  | `ci-design` and `project-ci-design` | changing a workflow, a job or a trigger                       |
  | `verify`                            | checking a change in the running app                          |

- A sync job copies the shared skills in `.agents/skills/` from
  [zgeoff/skills](https://github.com/zgeoff/skills) and overwrites local changes. Never edit them
  here. When a skill is wrong, say so in your PR description.
- The repo owns `verify`, `project-testing` and `project-ci-design`, and you may edit them. The
  `project-` skills hold this repo's commands and the shared rules they replace.
- After you change the `verify` skill, a feature file or its registry, run `bun verify lint`. When
  it fails with check `template`, or when the `@wringer/gunshi` version in the root catalog changes,
  run `bun verify guide maintain`, and follow its steps.

## Layout

[The layout doc](docs/architecture/repo/layout.md) sets the rules for packages, folders and imports.
Read it before you add a package, a file or an import. The workspace has five kinds of package:

- `apps/`: the CLI and the server. They build the adapters and pass them in.
- `modules/`: the domain logic. A module reads no files, starts no processes, makes no network
  calls, and reads neither the clock nor the environment. It gets time and settings as arguments.
- `adapters/`: one package for each outside system, such as the store or GitHub.
- `libs/`: types, schemas and pure helpers that two or more packages use, such as `@boxxy/model`.
  A lib does no I/O, the same as a module.
- `packages/`: deployed packages, which another repo's deployment installs, such as `@boxxy/pepys`.
  A deployed package imports libs only, and only an app imports a deployed package.

Three checks enforce the layout in CI:

- `turbo boundaries` fails on an import that the package's `turbo.json` tag doesn't allow.
- The `zgeoff/import-zones` lint rule lets only the packages that the layout doc names import each
  pinned third-party library, and fails when a file in `modules/` or `libs/` imports a Node module
  for files, processes or the network. To add a new third-party library, add its pin to the layout
  doc's list in the same PR.
- oxlint's `no-restricted-globals` rule fails on any use of `Date`, `process` or `Bun` in
  `modules/` and `libs/`.

When a check fails, move the code to the package the layout names. Never add an exception to a rule.

## Docs and decisions

- **Change a doc in the same PR as the code that changes what it says.** When your change makes a
  sentence in an architecture doc or a design doc false, rewrite that sentence in that PR.
- `docs/architecture/` describes the built system, in the present tense. When you build part of a
  design, describe what you built in the architecture doc that owns that part of the system. The
  [overview](docs/architecture/overview.md) links each one. Replace the built section of the design
  doc with a link to that architecture doc, so each fact keeps one owner.
- `docs/design/` holds a design until its work is built. A design is built when no section of it
  describes code that the repo lacks. In the PR that builds its last unbuilt part:
  1. Move each fact that still holds into the architecture doc that owns the fact's part of the
     system. When no architecture doc covers that part, add one by the `docs-writing` skill's
     architecture docs reference.
  2. Delete the design doc, and its line in the [design index](docs/design/boxxy/README.md).
- Each fact has one doc that owns it. Link to that doc. Never copy the fact.
- `docs/decisions/` holds the decision records. Add or change one only when your task asks for it.
  Never delete one.
  - Copy the shape of the newest record. Give it the next free four-digit number. Date it with the
    day the owner made the choice, in `YYYY-MM-DD` form: the date the task gives, or today when it
    gives none.
  - To change a decision, edit its record, and add an `Updated: YYYY-MM-DD` line under its date.

## Verify before you hand off

`bun verify` starts boxxy locally and drives each feature, such as filing an item, through its
journey: the commands a user would run. When a feature's journey passes, `bun verify done` records
a verdict for it. CI fails a pull request that changes a feature with no verdict in its
description. [Verify journeys](docs/architecture/repo/verify-journeys.md) owns what each journey
proves.

After your last code change:

1. Load the `verify` skill, and follow its "Check a change" steps for each feature that
   `bun verify report` marks `changed: true`. Each step gives the output to expect.
2. Push the branch and open the pull request before you publish. The `verify` skill gives the command. It writes the
   report into the open pull request's description, and fails when none is open.

An edit to a feature's files after `done` makes its verdict stale: run its journey and `done` again,
then `publish`. When a journey fails, fix the code. Change the journey only when you mean to change
what the feature does.

## Packages

- Pin every external version once, exactly, in the root `workspaces.catalog`. A package writes
  `"catalog:"` for an external dependency and `"workspace:*"` for another `@boxxy/*` package.
- Install with the Bun version in `packageManager`. Another version rewrites unrelated lines of
  `bun.lock`.
- When you add a first-party package, such as one from `@zgeoff/`, `@impz/` or `@pepys/`, add its
  full name to `minimumReleaseAgeExcludes` in `bunfig.toml`. Renovate bumps these packages as soon
  as they publish, and without the entry `bun install` refuses the bump. A scope pattern such as
  `@zgeoff/*` lets nothing through.
- Never ignore an audit finding to get past CI's dependency audit.

## Checks

- `bun run typecheck`, `bun run lint` and `bun run test` are the local checks. Run them before you
  push, and fix every failure. `bun run test` runs `rig unit`, which runs the tests in random order
  with no isolation between the files of a worker. It runs every test outside `e2e/`, `evals/` and
  `bench/`, the CLI's tests against the real server among them.
- `bun run check:docs` runs the docs checks. `bun run bench` runs the benchmarks through
  `rig bench`. CI does not run the benchmarks.
- `bun run lint:full` adds the type-aware pass and the type check. oxlint runs both through `tsrs-lint`, which `tsrs` ships, in fast mode (`TSRS_FAST=1`). It runs in CI only, so never run
  it locally.
- lefthook runs the light checks before a commit and a push: lint on the files your branch changes,
  the format check, the type check, the tests beside the changed files, and `turbo boundaries`. To
  run the pre-push jobs before you push:

  ```bash
  bun x lefthook run pre-push
  ```

- Leave the larger checks to CI, because the host may have little memory. CI runs the audit, the
  knip dead-code check, the type-aware lint and the full test suite on every pull request.

## Commits and pull requests

- Every change reaches `main` through a pull request from its own branch. Open it with the repo's
  pull request template.
- Commit messages and PR titles follow [Conventional Commits](https://www.conventionalcommits.org/).
  The subject starts in lowercase, uses the imperative ("add X", never "added X"), and keeps the
  whole first line to 72 characters or fewer.
- Add no attribution lines: no co-author trailers and no generator notes.

## Public repo

Everything pushed here is public, including commit messages and PR descriptions.

- Leave out home directory paths, host names, private network names and cloud account details.
- Leave out people's names, spend figures, account details and issue tracker ids.
- In tests and fixtures, use invented values, such as `/tmp/boxxy-test` for a path.
- Before each commit, search the staged diff:

  ```bash
  git diff --cached | grep -nE 'sk-ant|GOCSPX|AGE-SECRET-KEY|ops_|/home/|\.ts\.net'
  ```

  Remove each match. Search your PR description for the same strings before you open the PR. When a
  match is already in a commit on your branch, rewrite that commit before you push.

**Reply:** the pull request link, its CI state, and each feature you could not verify; or, when
unmerged work blocked you, that pull request or issue.
