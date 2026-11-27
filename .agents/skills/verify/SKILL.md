---
name: verify
description:
  'Grades a boxxy change with `bun verify`: runs the journey of each feature the change touches
  against a local boxxy, and records the verdict. Load it before you check a change in the running
  app, run the journey of a feature, or put the verdicts in a PR.'
metadata:
  wringer-template: 'sha256:c276ebe8d896'
  wringer-command: bun verify
---

# Verify boxxy

Use `bun verify` to start the app, use each feature your change touches the way a user would, and
record a verdict that it works. Put the report in the PR with step 11 of
[Check a change](#check-a-change), and hand back the PR link and each feature you could not verify.
Leave `bun verify gate` to CI: it reads the report from the PR description, and fails a PR that
changes a feature with no verdict there.

The mistakes that cost the most time:

- **Using the app before `doctor` passes.** `bun verify doctor` checks that the app answers and that
  each driver works. Until `doctor` passes after `bun verify up` or `bun verify attach`, any command
  that touches the app fails with exit code 3.
- **Editing the app's code while `up` runs it.** The next app command fails with `doctor-required`:
  run `up --restart`, `doctor`, then the journey.
- **Running `done` before you check the end state.** `done` checks only that one journey command
  succeeded.

## Key rules

- [Check a change](#check-a-change): for each changed feature, run its journey, check the end state,
  then `done`; then push and publish with the upload token read in a subshell.
- [Read the envelope](#read-the-envelope): branch on the exit code and `error.code`, never on the
  message, which can change in any release.
- [Targets](#targets): check a change on a launch target, a target whose app `bun verify up` starts
  from your worktree.
- [Commands](#commands): read `--help` before you guess a flag.
- [Edit the skill and the registry](#edit-the-skill-and-the-registry): map each new file in the
  registry, read the reference before you edit the skill, and run `lint`.

## References

- [Exit codes](references/exit-codes.md): when a command fails, what to do for its exit code and
  `error.code`.
- [Edit the skill](references/edit-the-skill.md): before you edit this skill or a feature file.

Read a feature's file before you run its journey.

<!-- wringer:features -->

| Feature       | Summary                                                                               | File                                                                       |
| ------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| file-item     | The owner files an item, and boxxy shows it                                           | [references/feature-file-item.md](references/feature-file-item.md)         |
| claim-settle  | boxxy claims an item, a session closes out, and the attempt settles                   | [references/feature-claim-settle.md](references/feature-claim-settle.md)   |
| report-cost   | A merged item reports its cost and stage times                                        | [references/feature-report-cost.md](references/feature-report-cost.md)     |
| plan-ordering | Expedite and defer set which item the runner claims                                   | [references/feature-plan-ordering.md](references/feature-plan-ordering.md) |
| runner-pause  | A paused runner claims nothing                                                        | [references/feature-runner-pause.md](references/feature-runner-pause.md)   |
| hold-notice   | A held item sends one notice to the notice session                                    | [references/feature-hold-notice.md](references/feature-hold-notice.md)     |
| hold-recovery | A retry lifts a hold and runs the chosen phase                                        | [references/feature-hold-recovery.md](references/feature-hold-recovery.md) |
| owner-signoff | The owner signs off a pull request that edits a matched path, before it merges        | [references/feature-owner-signoff.md](references/feature-owner-signoff.md) |
| owner-mcp     | An agent signs in to the public door as a service client, and calls the owner's tools | [references/feature-owner-mcp.md](references/feature-owner-mcp.md)         |

<!-- /wringer:features -->

## Check a change

1. Run `bun verify report`. In `data.report.features`, a feature shows `changed: true` when a file
   that matches its `paths` in the [registry](#edit-the-skill-and-the-registry) differs from the
   default branch, committed or not.
2. Pick the target your task names. When it names none, take the first launch target in the
   [Targets](#targets) table. Run the commands in its row. `up` or `attach` starts a run, which
   lasts until `down` or `detach`. Expect from `up` or `attach`: `ok: true`, and the app's endpoints
   in `data.endpoints`.
3. Run `bun verify doctor`. Expect: `data.passed: true`. When a check fails, fix its cause, and run
   `doctor` again.
4. Run the journey from the feature's file in [References](#references). Its first line,
   `use --feature`, records each later command under that feature, and leaves the target as it is.
   Expect: each command exits 0. When one fails, do what its row in
   [Exit codes](references/exit-codes.md) says.
5. Compare the app with the feature's end state:
   - When it matches, and no command failed with `read-only`, go on to step 6.
   - When your change broke the feature, fix the app's code. Then run `bun verify up --restart`,
     `bun verify doctor` and the journey again.
   - When your change means to change the end state, fix the feature's file, and run
     `bun verify lint`. Then run the journey again.
   - In any other case, such as a `read-only` failure or a bug your change did not cause, skip
     `done` for this feature. List it in your reply with the end state you expected and the `data`
     you got.
6. Record the verdict:
   - Finish each edit to a file that matches the feature's `paths` first. An edit after `done` makes
     the verdict `stale`. A commit alone leaves the verdict as it was.
   - Once the end state matches in step 5, run `bun verify done`. Expect: `ok: true`. `done` records
     a verdict for the feature that `use --feature` set.
   - `done` checks only that a journey command succeeded after `doctor`, and never reads the end
     state. Until a journey command succeeds, `done` fails with `check-failed`.
7. Repeat steps 4 to 6 for each feature with `changed: true`, and for each feature your task names,
   in the order of the table in [References](#references). When the [Targets](#targets) section says
   to run a feature's journey last, run it after every other journey.
8. Run `bun verify report --human` to read the report. Expect: `verified` on each changed feature
   you did not skip in step 5. Repeat steps 4 to 6 for each `stale` feature.
9. Push the branch, and open a PR for it when none is open. Without an open PR, `publish` fails and
   writes nothing.
10. Check that `CLOUD_FILES_URL` and `CLOUD_FILES_TOKEN_REF` are set. When either is empty, stop and
    report it as a blocker. `CLOUD_FILES_URL` is the file host that takes the local target's
    evidence files. `CLOUD_FILES_TOKEN_REF` is the 1Password `op://` reference to the upload token.
    Never run `op read` on its own: it prints the token.
11. Publish the report, even when you skipped a feature. Read the token in a subshell, so it never
    sits in your shell. Because `&&` joins them, a failed `op read` stops the command before
    `publish` runs:

    ```bash
    (CLOUD_FILES_TOKEN="$(op read "$CLOUD_FILES_TOKEN_REF")" && export CLOUD_FILES_TOKEN && bun verify publish)
    ```

    To write to a PR other than the branch's own, add `--pr <number>`. When `op read` fails, stop
    and report it as a blocker. Expect: `ok: true`, and `data.action` of `created`, `replaced` or
    `unchanged`. It writes the report into the PR's description, the only report the gate reads.

12. End the run: `bun verify down` after `up`, or `bun verify detach` after `attach`.

## Read the envelope

Each command prints one JSON envelope as its last line, or text with `--human`. A streaming command,
such as `doctor`, prints JSON event lines before the envelope. Read these fields:

- `ok`, then `data` on success, or `error.code`, `error.message` and `error.hint` on failure;
- `evidence`: the files the command kept, under `.wringer/`;
- `truncatedPath`: the file that holds `data` when it was too large to print.

When a command fails, find its exit code and `error.code` in [Exit codes](references/exit-codes.md),
and do what that row says.

## Targets

Start a launch target's app with `bun verify up`, and stop it with `bun verify down`. Connect to an
attach target, a target whose app runs apart from `bun verify`, with `bun verify attach`.
`bun verify detach` leaves it running. Your edits never reach an attach target's app, so check a
change on a launch target.

Run `bun verify use --target <target>` to point every later command at a target. `use` saves the
choice in this worktree's `.wringer/`, for every shell and session. `--target` on one command points
that command alone. A command with neither runs on the registry's first target, so run `use` first.

<!-- repo: targets -->

| Target  | Kind   | Start with                                                      | Access     |
| ------- | ------ | --------------------------------------------------------------- | ---------- |
| `local` | launch | `bun verify use --target local`, then `bun verify up`           | read-write |
| `prod`  | attach | the steps in [On prod](references/feature-owner-mcp.md#on-prod) | read-only  |

Each `up` starts the harness: boxxy's server and CLI on an empty SQLite store, with no network, and
fakes for the clock, the worker, GitHub and the hold-notice sender.

<!-- /repo -->

## Commands

Run `bun verify --help` for the list, with each command marked `[read]` or `[write]`. A read-only
target refuses each `[write]` command except `publish`, which writes no app data. `up` and `down`
are `[read]`, but start and stop the app. Run `bun verify <command> --help` for a command's flags.
The top-level list shows only the name of a group, such as `action`: run `bun verify <group> --help`
for its commands.

- Write a negative number with `=`, as in `--offset=-5`.
- Pass an object as JSON text, as in `--filter '{"shelf":"top"}'`.

<!-- repo: commands -->

- An `action` takes one step as the owner or as the harness. Later journey lines act on the item
  that `file-item` or `land-item` filed last, and the harness closes the item filed before it.
- `bun verify boxxy <name>` takes the expected values as flags.

<!-- /repo -->

## Edit the skill and the registry

<!-- repo: registry -->

List each feature's files in `feature-paths.ts`, beside the
[registry](../../../apps/cli/src/test-utils/verify/verify-registry.ts), and the rest in
`core-paths.ts`. [Verify journeys](../../../docs/architecture/repo/verify-journeys.md) owns what
each journey proves.

<!-- /repo -->

In the registry, map each file your change adds: add a glob that matches it to a feature's `paths`,
to `.shared()` or to `.ignore()`. The gate fails on a changed file that no glob matches. Add a file
that the running app never reads, such as a test, to `.ignore()`. `bun verify features` lists the
globs.

When a change to a feature breaks its journey, fix the journey in the same PR. Before you edit this
skill or a feature file, read [Edit the skill](references/edit-the-skill.md). After you change this
skill, a feature file or the registry, run `bun verify lint`, and fix each failure it reports.

**Reply:** the PR link that `bun verify publish` returned in `data.pr.url`, and each feature you
could not verify, with the command that failed and its `error.code`, or the end state you expected
and the `data` you got.
