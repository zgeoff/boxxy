# The CLI and the hooks

`boxxy`, the command of `@boxxy/cli`, calls the server's [procedures](./api-and-auth.md). The owner
runs it at a terminal. An agent runs it inside a session, and a hook plug-in runs two of its
commands for the agent. When a session starts, the first hook installs the skills of the session's
attempt and then binds the session to that attempt. After each `gh pr create`, the second hook links
the new pull request to the attempt. The server makes every decision: a command reads its flags,
calls the server, and prints the answer. The session commands and the hooks first ask the server for
the session's attempt, and only the session-start hook does work of its own, the skills fetch.

[The overview](../overview.md#terms) defines the terms this doc uses.
[API and auth](./api-and-auth.md) covers the server's listeners that the CLI reaches and who may
call each procedure. [Attempt lifecycle](../work/attempts.md) covers the attempt that a session's
commands act on. [Release](../repo/release.md) covers how the binary and the hook plug-in reach the
agent image.

## Setup

The CLI reads two environment variables and no configuration file:

- `BOXXY_URL` is required. It holds the server's address, `http` or `https`, with an optional path
  prefix that the CLI puts before `/rpc`. At a terminal, the owner sets it to the address of the
  owner listener. In a session, an auth profile in atc sets it to a host name that the imp broker
  owns, as [the paths](./api-and-auth.md#the-paths) describes.
- `BOXXY_SKILLS_URL` is optional. It holds the base address that the session-start hook fetches the
  skills repository from, and it defaults to `https://github.com`.

The CLI sends no token and no identity header. The owner listener needs none, and in a session the
imp broker adds both on the way out. The CLI calls the server through the typed oRPC client of the
contract package, `@boxxy/contract`, and that client sends each request with Bun's `fetch`. Bun's
`fetch` honours `HTTPS_PROXY`, so the CLI works behind a proxy that the environment sets.

## Commands

Each procedure of the contract has exactly one command, and a test fails when a procedure has none
or two. The two hook commands are the commands of `attempt.bindSession` and
`attempt.recordPullRequest`. The access table in `@boxxy/contract` holds the usage line of each
command, in the `cli` field of the procedure's row. `boxxy --help` prints every usage line,
`boxxy <group> --help` prints the lines of one group, and `boxxy --version` prints the version of
`@boxxy/cli`.

A command prints the server's answer as JSON on stdout. These commands print less:

- `attempt evidence` prints the evidence ID.
- `attempt close-out` prints the ID of the fact it recorded. When the close-out parser finds
  problems, it prints one line for each problem on stderr
  ([close-outs](../work/attempts.md#close-outs-and-their-limits)).
- `auth enroll` prints the one-time enrollment link, and `auth clients add` prints the client ID.
  The `auth` commands manage [the public listener](./api-and-auth.md#the-public-door) and run over
  the owner listener only.

A script branches on the exit code:

| Exit | When                                                               |
| ---- | ------------------------------------------------------------------ |
| 0    | the server did what the command asked                              |
| 1    | the server answered with the kind `refused`, `rejected` or `fault` |
| 1    | the server threw a typed error                                     |
| 2    | the command line is wrong, or `BOXXY_URL` is missing               |
| 2    | an `attempt` command found no attempt for the session              |

A command that prints JSON prints it for a `refused`, `rejected` or `fault` answer too. For a typed
error, the command prints `error: <code>: <message>` on stderr. A command checks `BOXXY_URL` before
it reads stdin. The hooks set their own exit codes, which
[the session-start hook](#the-session-start-hook) and
[the pull request hook](#the-pull-request-hook) describe.

The owner's item commands behave like this:

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

`plan defer --until` takes an ISO 8601 time with an offset, and the server checks it.

The session commands are the `attempt` commands, which an agent runs inside its session. None of
them takes a session argument, because the server finds the session from the
[proven caller](./api-and-auth.md#the-proven-caller). `attempt evidence` and `attempt close-out`
therefore first call `attempt.current` to learn the session's attempt, and send that attempt's ID.

Right after a session starts, the server can have no attempt for it. The runner records the
session's caller on the [attempt](../work/attempts.md) only after atc answers the start of the
session, and the agent can run a command before that. A session command then exits 2 with a message
that asks the agent to try again. The CLI never retries a session command, and the agent runs it
again. The hooks wait for the attempt by themselves.

A session reads other items with `attempt list-items` and `attempt show-item <item>`.
`attempt list-items` takes the flags of `item list` except `--repo` and `--held`. The server answers
both commands only for the repo of the session's own item
([the session's reads](./api-and-auth.md#the-sessions-reads-of-other-items)). `item list` and
`item show` stay owner commands, and the server answers `FORBIDDEN` to a session that runs them.

## The session-start hook

`boxxy hook session-start` reads the SessionStart payload of Claude Code on stdin (`session_id`,
`cwd`) and does this:

1. Calls `attempt.current` until the server has an attempt for the session, which can lag the
   session's start, as [Commands](#commands) describes. `callerWait` in `@boxxy/cli`'s
   `constants.ts` sets the number of tries and the delay between them. When every try finds no
   attempt, the hook exits 1.
2. Installs into `<cwd>/.claude/skills/<skill>` each skill that the attempt's
   [recipe](../work/pipeline.md#recipes-and-skills) lists. The rules file pins one commit of the
   skills repository, and the answer of `attempt.current` holds the skill names and that pin.
   [Installing skills](#installing-skills) describes the fetch.
3. Calls `attempt.bindSession` with the session ID from the payload, the agent product
   `claude_code`, and the names of any missing skills.
4. On a `bound` answer, prints the
   [SessionStart hook JSON](https://code.claude.com/docs/en/hooks#sessionstart-decision-control) of
   Claude Code and exits 0.

The hook sets `reloadSkills` to `true` when the recipe lists a skill. Claude Code looks for skills
before the hook ends, so without the reload the agent's first prompt runs without the skills the
hook installed.

The hook also puts a guide in `additionalContext`, because a recipe prompt can leave out how to
close out, and a session that ends without a valid close-out fails. The guide holds the attempt's
phase and the outcomes that the phase's close-out can send
([the pipeline](../work/pipeline.md#the-pipeline)). It also holds where the agent finds its task and
its input, the session commands, and the evidence kind for a screenshot, a measurement and a long
log. `formatSessionGuide` in `apps/cli/src/hooks/` holds the text.

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

The hook counts a skill as installed only when the skill's folder in the workspace holds a
`SKILL.md`. The copy replaces any earlier copy, so a
[kept session](../work/sessions.md#the-kept-session) that resumes under a new pin gets the new
files. A recipe that lists no skills makes the hook skip the fetch.

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
call. A test checks that the CLI has each command in that file. atc refuses the `pluginDirs` option
of its spawn call for a session in an imp, so boxxy cannot hand the plug-in to a session at start.
The image therefore holds the plug-in and the `boxxy` binary, and the agent configuration in the
image holds the plug-in's folder. The image takes both from the CLI's GitHub release, as
[the CLI release assets](../repo/release.md#the-cli-release-assets) describes.

## Testing the CLI

`createTestCLI` in `apps/cli/src/test-utils/` starts the real server on the memory store, with the
fake atc worker, forge and clock, and runs the CLI in-process against it with no network. It stands
in for the imp broker: it sends each session or hook procedure to the worker listener with the
worker token, and every other procedure to the owner listener
([the doors](./api-and-auth.md#the-doors)). A test sets the proven caller and ticks the runner
through the server's test utils. The tests that use `createTestCLI` sit beside the CLI module each
one drives, and reach the server only through its test utils
([dependency rules](../repo/layout.md#dependency-rules)). The CLI's other tests use a fake `fetch`.
