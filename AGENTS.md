# Working in boxxy

boxxy decides which task a fleet of coding agents works on next, and measures what each task costs.
Your job here is one change, from one task. Build what the design docs specify, keep those docs
true, and hand back an open pull request with green CI. Don't merge it: the repo owner merges every
pull request.

The mistakes that cost most here:

- code in a package that the [layout](docs/design/boxxy/layout.md) doesn't allow;
- a behaviour change with no change to the design doc that describes the behaviour;
- anything private pushed to this public repo.

## Key rules

- [Before you start](#before-you-start): read the design doc for your task, and load the skills
  your work needs.
- [Layout](#layout): follow the layout doc. Code under `modules/` and `libs/` does no I/O.
- [Docs and decisions](#docs-and-decisions): a design doc changes in the same PR as the code.
- [Packages](#packages): one exact version per dependency, in the root catalog.
- [Checks](#checks): run the local checks before you push. The type-aware lint runs in CI only.
- [Commits and pull requests](#commits-and-pull-requests): Conventional Commits, one PR per
  change, no attribution lines.
- [Public repo](#public-repo): nothing from your machine or anyone's private setup.

## Before you start

- Find your task's build unit in the [first build spec](docs/design/boxxy/slice-1.md). Read the
  unit, and each design doc it links. The [core model](docs/design/boxxy/core-model.md) defines the
  terms.
- For v1 work, find your slice in the [v1 work list](docs/design/boxxy/v1-work-list.md), and read
  the [v1 design](docs/design/boxxy/v1.md) and the sketch files the slice names. Where a v1 doc and
  the first build spec differ, the v1 doc stands.
- Check the unit's "Depends on" list. When a unit it names hasn't merged, stop, and report the task
  as blocked by that unit. The repo-setup unit creates the root `package.json`, and every other unit
  depends on it.
- Load the skill for the work before you start it. The skills are in `.claude/skills/`:

  | Skill          | Load before                             |
  | -------------- | --------------------------------------- |
  | `docs-writing` | writing or editing any committed prose  |
  | `code-style`   | writing, reviewing or renaming code     |
  | `testing`      | writing or reviewing a test             |
  | `ci-design`    | changing a workflow, a job or a trigger |

- A sync job copies the skills in `.claude/skills/` from
  [zgeoff/skills](https://github.com/zgeoff/skills) and overwrites local changes. Never edit them
  here. When a skill is wrong, say so in your PR description.

## Layout

[The layout doc](docs/design/boxxy/layout.md) sets the rules for packages, folders and imports.
Read it before you add a package, a file or an import. The workspace has five kinds of package:

- `apps/`: the CLI and the server. They build the adapters and pass them in.
- `modules/`: the domain logic. A module reads no files, starts no processes, makes no network
  calls, and reads neither the clock nor the environment. It gets time and settings as arguments.
- `adapters/`: one package for each outside system, such as the store or GitHub.
- `libs/`: types, schemas and pure helpers that two or more packages use, such as `@boxxy/model`.
  A lib does no I/O, the same as a module.
- `packages/`: packages that another repo's deployment installs, such as `@boxxy/pepys`. A package
  imports libs only, and only an app imports a package.

Three checks enforce the layout in CI:

- `turbo boundaries` fails on an import that the package's `turbo.json` tag doesn't allow.
- The `zgeoff/import-zones` lint rule lets only one package import each third-party library, and
  fails when a file in `modules/` or `libs/` imports a Node module for files, processes or the
  network. The layout doc lists which package owns each library. To add a new third-party library,
  add it to that list in the same PR.
- oxlint's `no-restricted-globals` rule fails on any use of `Date`, `process` or `Bun` in
  `modules/` and `libs/`.

When a check fails, move the code to the package the layout names. Never add an exception to a rule.

## Docs and decisions

- **Change a design doc in the same PR as the code that changes the design.** When your change makes
  a sentence in a design doc false, rewrite that sentence in that PR.
- Each fact has one doc that owns it. Link to that doc. Never copy the fact.
- `docs/decisions/` holds the decision records. Add or change one only when your task asks for it.
  Never delete one.
  - Copy the shape of the newest record. Give it the next free four-digit number. Date it with the
    day the choice was made, in `YYYY-MM-DD` form.
  - To change a decision, edit its record, and add an `Updated: YYYY-MM-DD` line under its date.

## Packages

- Pin every external version once, exactly, in the root `workspaces.catalog`. A package writes
  `"catalog:"` for an external dependency and `"workspace:*"` for another `@boxxy/*` package.
- Install with the Bun version in `packageManager`. Another version rewrites unrelated lines of
  `bun.lock`.
- Give each first-party package that `bun.lock` holds, such as one from `@zgeoff/` or `@atcx/`, an
  entry in `minimumReleaseAgeExcludes` in `bunfig.toml`, by its full name. A scope pattern such as
  `@zgeoff/*` lets nothing through. Never ignore an audit finding to get past the gate.

## Checks

- `bun run typecheck`, `bun run lint` and `bun run test` are the local checks. Run them before you
  push, and fix every failure. `bun run test` runs `rig unit`, which runs the tests in random order
  with no isolation between the files of a worker.
- `bun run check:docs` runs the docs checks. `bun run bench` runs the benchmarks through
  `rig bench`. CI does not run the benchmarks.
- `bun run lint:full` adds the type-aware pass and the type check. It runs in CI only, so never run
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

**Reply:** the pull request link, its CI state, and each "Depends on" unit that blocked you.
