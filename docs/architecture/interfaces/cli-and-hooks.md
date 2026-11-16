# The CLI and the hooks

`boxxy`, the command of `@boxxy/cli`, calls the server's [procedures](./api-and-auth.md). The owner
runs it at a terminal. An agent runs it inside a session, and a hook plug-in runs two of its
commands for the agent. When a session starts, the first hook installs the skills of the session's
attempt and then binds the session to that attempt. After each `gh pr create`, the second hook links
the new pull request to the attempt. The CLI holds no business logic: a command reads its flags,
sends one call, and prints the answer.

[The overview](../overview.md#terms) defines the terms this doc uses.
[API and auth](./api-and-auth.md) covers the server's listeners that the CLI reaches and who may
call each procedure. [Attempt lifecycle](../work/attempts.md) covers the attempt that a session's
commands act on. [Release](../repo/release.md) covers how the binary and the hook plug-in reach the
agent image.

## Setup

The CLI reads two environment variables and no configuration file:

- `BOXXY_URL` is required. It holds the server's address, `http` or `https`, with an optional path
  prefix that the CLI puts before `/rpc`. At a terminal, the owner sets it to the address of the
  owner listener. In a session, the session's atc auth profile sets it to the made-up host name that
  the imp broker answers on.
- `BOXXY_SKILLS_URL` is optional. It holds the base address that the session-start hook fetches the
  skills repository from, and it defaults to `https://github.com`.

The CLI sends no token and no identity header. The owner listener needs none, and in a session the
imp broker adds both on the way out. The client is the typed oRPC client of the contract and calls
the platform's `fetch`, so `HTTPS_PROXY` applies.

## Commands

Each procedure of the contract has one command, and a test fails when a procedure has none. The
access table in `@boxxy/contract` holds the usage line of each command, in the `cli` field of the
procedure's row. `boxxy --help` prints every usage line, and `boxxy <group> --help` prints the lines
of one group. `apps/cli/src/commands/` holds the words and flags of each command as plain data, one
file for each procedure group, and `node:util` `parseArgs` reads them. `boxxy --version` prints the
version of `@boxxy/cli`.

A command prints the server's answer as JSON on stdout. These commands print less:

- `attempt evidence` prints the evidence ID.
- `attempt close-out` prints the ID of the fact it recorded. When the close-out parser finds
  problems, it prints one line for each problem on stderr
  ([close-outs](../work/attempts.md#close-outs-and-their-limits)).
- `auth enroll` prints the one-time enrollment link, and `auth clients add` prints the client ID.
  The `auth` commands manage [the public listener](./api-and-auth.md#the-public-door) and run over
  the owner listener only.

A command exits with one of three codes:

- 0 when the server did what the command asked.
- 1 for a typed server error, with `error: <code>: <message>` on stderr, and for a refused answer
  (`refused`, `rejected` or `fault`), which prints the same JSON as a done answer.
- 2 for a wrong command line. Every command exits 2 with `error: BOXXY_URL is not set` when
  `BOXXY_URL` is missing, before it reads stdin.

A session command also exits 2 when the server has no attempt for the session yet. The runner
records a session's caller on the attempt row only after atc answers the start of the session, so a
command that runs first finds no attempt, and a retry a little later succeeds. The two hooks differ
from the other commands in their exit codes, as [the session-start hook](#the-session-start-hook)
and [the pull request hook](#the-pull-request-hook) describe.

The item commands behave like this:

- `item file` and `item edit` take the body with `--body <text>` or `--body-file <path>`, where a
  path of `-` reads stdin. Giving both flags exits 2. `item edit` with neither flag leaves the body
  as it is.
- `item file --held "<reason>"` files the item [held](../work/pipeline.md#derived-item-state), and
  `item release <item>` releases it. `item list --held` lists only the held items, the same as
  `--state held`, so it exits 2 when `--state` gives another state.
- `item file --security` files the item with the
  [security mark](../work/pipeline.md#the-ledger-labels-notes-and-relations). `item edit --security`
  sets the mark, and `item edit --no-security` clears it. Giving both exits 2, and giving neither
  leaves the mark as it is.
- `item edit --acceptance` can repeat, and the values replace the whole acceptance list, so the
  server drops a criterion that no value carries. For a value of `[c-3] new text`, the server keeps
  the criterion `c-3`, with its evidence, and gives it the new text. The server refuses an ID that
  the item does not have. Any value without an ID adds a new criterion.
- `item show` prints the item's JSON, with the body and one revision for each edit. Each revision
  holds the time of the edit and the fields that the edit set.
- `plan defer --until` takes an ISO 8601 time with an offset, and the server checks it.

The session commands name no session. `attempt evidence` and `attempt close-out` first call
`attempt.current`, which answers for the [proven caller](./api-and-auth.md#the-proven-caller), and
send the ID of that attempt. A session reads other items with `attempt list-items` and
`attempt show-item <item>`. `attempt list-items` takes the flags of `item list` except `--repo` and
`--held`. The server answers both for the repo of the session's own item only
([the session's reads](./api-and-auth.md#the-sessions-reads-of-other-items)). `item list` and
`item show` stay owner commands, and the server answers `FORBIDDEN` to a session that runs them.

## The session-start hook

`boxxy hook session-start` reads the SessionStart payload of Claude Code on stdin (`session_id`,
`cwd`) and does this:

1. Calls `attempt.current` until the server has an attempt for the session. The runner records the
   session's caller only after atc answers the start, and Claude Code can run the hook before that.
   `callerWait` in `@boxxy/cli`'s `constants.ts` sets the number of tries and the delay between
   them. When every try finds no attempt, the hook exits 1.
2. Installs each skill that the attempt's [recipe](../work/pipeline.md#recipes-and-skills) lists, at
   the commit of the skills repository that the rules file pins, into
   `<cwd>/.claude/skills/<skill>`. [Installing skills](#installing-skills) describes the fetch.
3. Calls `attempt.bindSession` with the agent session ID, `claude_code` and, when a skill is
   missing, `missingSkills`.
4. On a `bound` answer, prints the
   [SessionStart hook JSON](https://code.claude.com/docs/en/hooks#sessionstart-decision-control) of
   Claude Code and exits 0.

The hook sets `reloadSkills` to `true` when the recipe lists a skill. Claude Code looks for skills
before the hook ends, so without the reload the agent's first prompt runs without the skills the
hook installed.

The hook also puts a guide in `additionalContext`, because a recipe prompt can leave out how to
close out, and a session that ends without a valid close-out fails. The guide holds the phase and
its outcome names, where the agent finds its task and its input, the session commands, and the
evidence kind that fits a screenshot, a measurement and a long log. `formatSessionGuide` in
`apps/cli/src/hooks/` holds the text.

On a `skill-missing` answer, the server moves the attempt to `closing`, the runner settles it as
failed with `skill-missing`, and the hook exits 1 with the names of the missing skills. The hook
exits 1 for every answer other than `bound`.

### Installing skills

The hook runs `git` as a process, so the fetch uses git's own proxy settings. In a new scratch
folder, the hook runs `git init` and `git fetch --depth 1` of the pinned commit from
`<BOXXY_SKILLS_URL>/<owner>/<repo>.git`, where `<owner>/<repo>` is the pinned skills repository. For
each skill, it checks out `skills/<skill>` from `FETCH_HEAD` and copies that folder into the
workspace. The hook removes from git's environment the variables that
`git rev-parse --local-env-vars` lists, such as `GIT_DIR`, and removes `GIT_CEILING_DIRECTORIES`
too. With those variables gone, git writes only in the scratch folder.

A skill is installed when its folder in the workspace holds a `SKILL.md`. The copy replaces any
earlier copy, so a [kept session](../work/sessions.md#the-kept-session) that resumes under a new pin
gets the new files. A recipe that lists no skills makes the hook skip the fetch.

The hook reports a skill as missing in these cases:

- the skill's name or the pin is malformed;
- the fetch fails;
- `.claude` or `.claude/skills` in the workspace is a symbolic link, or `.claude/skills` resolves
  outside the workspace;
- the copy fails, or the copied folder has no `SKILL.md`.

A failed fetch makes every listed skill missing, because the hook cannot tell a skill that the
repository lacks from one it could not read. The copy removes the skill's folder first, and a link
on the path would point that removal outside the workspace. The hook therefore checks the path just
before each copy, after git has run, and writes and removes nothing for a skill whose path fails the
check.

## The pull request hook

`boxxy hook post-tool-use` reads the PostToolUse payload (`tool_name`, `tool_input.command`,
`tool_response.stdout`). It does nothing and calls no procedure unless the call is a Bash call of
`gh pr create` that printed a pull request URL. Then it waits for the session's attempt as the
session-start hook does, and calls `attempt.recordPullRequest` with the last URL printed.

| Answer                            | Meaning                                                               | Exit |
| --------------------------------- | --------------------------------------------------------------------- | ---- |
| `linked`                          | The server linked the pull request to the attempt.                    | 0    |
| `retry`                           | The forge did not answer, and the server wrote nothing.               | 0    |
| `refused` with `linked-elsewhere` | The pull request belongs to another item.                             | 2    |
| any other `refused`               | The server refused the link, for example because the attempt is over. | 1    |

After a `retry`, the [pull request watch](./github.md#the-pull-request-watch) links the pull request
later. The hook exits 2 on `linked-elsewhere` because Claude Code shows the stderr of a PostToolUse
hook to the agent only on exit 2, and the agent must learn that it opened a pull request for the
wrong item.

## The hook plug-in

`apps/cli/hook-plugin/` is the plug-in that the agent image installs. Its `hooks/hooks.json` runs
`boxxy hook session-start` on `startup` and `resume`, and `boxxy hook post-tool-use` after each Bash
call. A test checks that the CLI has each command in that file. atc refuses its `pluginDirs` spawn
option for a session in an imp, so boxxy cannot hand the plug-in to a session at start. The image
therefore holds the plug-in and the `boxxy` binary, and the agent configuration in the image holds
the plug-in's folder. The image takes both from the CLI's GitHub release, as
[the CLI release assets](../repo/release.md#the-cli-release-assets) describes.

## Testing the CLI

`createTestCLI` in `apps/cli/src/test-utils/` starts the real server on the memory store, with the
fake worker, forge and clock, and runs the CLI in-process against it with no network. Its `fetch`,
`makeBrokerSend` from the server's test utils, stands in for the imp broker: it sends a session or
hook procedure to the worker listener with the worker token, and any other procedure to the owner
listener. A test sets the proven caller of the next request with `server.callerProof.setCaller`, and
ticks the runner with `server.tick()`. The tests that use `createTestCLI` sit beside the CLI module
each one drives, and reach the server only through its test utils
([dependency rules](../repo/layout.md#dependency-rules)). The CLI's other tests use a fake `fetch`.
