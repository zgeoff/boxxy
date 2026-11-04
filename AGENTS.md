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
- [Checks](#checks): the pre-push hook runs the checks; run it before you push.
- [Commits and pull requests](#commits-and-pull-requests): Conventional Commits, one PR per
  change, no attribution lines.
- [Public repo](#public-repo): nothing from your machine or anyone's private setup.

## Before you start

- Find your task's build unit in the [first build spec](docs/design/boxxy/slice-1.md). Read the
  unit, and each design doc it links. The [core model](docs/design/boxxy/core-model.md) defines the
  terms.
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
Read it before you add a package, a file or an import. The workspace has four kinds of package:

- `apps/`: the CLI and the server. They build the adapters and pass them in.
- `modules/`: the domain logic. A module reads no files, starts no processes, makes no network
  calls, and reads neither the clock nor the environment. It gets time and settings as arguments.
- `adapters/`: one package for each outside system, such as the store or GitHub.
- `libs/`: types, schemas and pure helpers that two or more packages use, such as `@boxxy/model`.
  A lib does no I/O, the same as a module.

Two checks enforce the layout in CI:

- `turbo boundaries` fails on an import that the package's `turbo.json` tag doesn't allow.
- The `zgeoff/import-zones` lint rule lets only one named package import each outside library, and
  fails on I/O in `modules/` and `libs/`, with oxlint's `no-restricted-globals` for the clock, the
  environment and `Bun`. The layout doc lists which package owns each library. To add a new
  outside library, add it to that list in the same PR.

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

## Checks

lefthook's pre-push hook runs lint, the format check, type checks, tests and `turbo boundaries`.
Run it by hand before you push:

```bash
bun x lefthook run pre-push
```

Fix every failure before you push. `bun run check` runs every check that CI runs, type-aware lint
and dead code included.

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
