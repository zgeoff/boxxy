# The CLI and the hooks

`boxxy`, the command of `@boxxy/cli`, calls the server's [procedures](./v1-api-and-auth.md). The owner runs it at a terminal. An agent runs it inside a worker session, and a hook plug-in runs two of its commands for the agent. The CLI holds no business logic: a command reads its flags, sends one call, and prints the answer.

## Setup

| Name | Needed | What it holds |
| --- | --- | --- |
| `BOXXY_URL` | always | The origin of the server. The owner sets the owner listener. In a session, an atc auth profile sets the broker's made-up host. |
| `BOXXY_SKILLS_URL` | no | Where the session-start hook fetches the skills repository from. It defaults to `https://github.com`. |

The CLI reads no configuration file and sends no token and no identity header: the listener needs none on the owner's path, and the broker adds both for a session. The client is `createORPCClient` over `RPCLink` from `@orpc/client` at the version in the root catalog, and it calls the platform's `fetch`, so `HTTPS_PROXY` applies.

## Commands

Each procedure of the contract has one command. The usage line of a command is the `cli` field of its row in the access table, `boxxy --help` prints them, and a test fails when a procedure has no command. `boxxy --version` prints the version of `@boxxy/cli`. The CLI imports its `package.json` for it, so a compiled binary, which has no `package.json` beside it, prints the same version. The words of a command and its flags are in `apps/cli/src/commands/`, one file for each procedure group, as plain data that `node:util` `parseArgs` reads. The CLI has no command framework, because a table of 26 commands needs no more than flags and words.

- **Output.** A command prints the server's answer as JSON. A refused answer (`refused`, `rejected`, `fault`) prints the same JSON and exits 1. The three session commands print less: `attempt evidence` prints the evidence ID, and `attempt close-out` prints the fact ID, or one line for each problem on stderr.
- **Exit codes.** 0 is done. 1 is a typed server error or a refusal, with `error: <code>: <message>` on stderr. 2 is a wrong command line, or, for a session command, no attempt for the session yet, which a retry in 5 seconds fixes. Every command, the hooks included, exits 2 with `error: BOXXY_URL is not set` when `BOXXY_URL` is missing, before it reads stdin.
- **Time flags** take ISO 8601 with an offset, and the server checks them.
- **`item edit --acceptance`.** `[a3] new text` keeps the criterion `a3` with its evidence and gives it the text. Any other value is a new criterion.
- **Session commands name no session.** `attempt evidence` and `attempt close-out` first call `attempt.current`, which answers from the proven caller, and send that attempt's ID.

## The session-start hook

`boxxy hook session-start` reads the SessionStart payload of Claude Code on stdin (`session_id`, `cwd`) and does this:

1. Calls `attempt.current` until the server has an attempt for the session: 6 tries, 5 seconds apart. The runner stores a session's caller after the worker answers the start, and the hook can run first. With no attempt it exits 1.
2. Installs each skill that `attempt.current` lists, at the rules' pin, into `<cwd>/.claude/skills/<name>`. [Installing skills](#installing-skills) says how.
3. Calls `attempt.bindSession` with the agent session ID, `claude_code` and, when a skill is absent, `missingSkills`.

A bind answer of `skill-missing` makes the server move the attempt to `closing`, and the runner settles it as failed with `skill-missing`. The hook then exits 1 and names the skills. The hook exits 0 for `bound` and exits 1 for every other answer.

### Installing skills

- **Fetch.** `git init` in a scratch folder, `git fetch --depth 1 <base>/<owner>/<name>.git <commit>`, then `git checkout FETCH_HEAD -- skills/<name>` for each skill, and a copy to the workspace. The CLI runs `git` as a process, so the fetch uses the proxy settings of git. The base is `BOXXY_SKILLS_URL`.
- **Present.** A skill is present when its folder in the workspace holds a `SKILL.md`. The copy replaces an earlier copy, so a kept session that resumes under a new pin gets the new files.
- **Missing.** A skill is missing when its name is not a plain name (lower case letters, digits, `.`, `_`, `-`), when the pin is not `owner/name` at a full commit, when the fetch fails, when `.claude` or `.claude/skills` in the workspace is a symbolic link, or when its folder is absent or has no `SKILL.md`. A failed fetch leaves every listed skill missing, because the hook cannot tell a skill the repository lacks from one it could not read. A link leaves every listed skill missing too, and the hook writes and removes nothing, because the copy removes each skill's folder first and a link would point that removal outside the workspace.
- **No skills.** A recipe that lists none fetches nothing.

## The pull request hook

`boxxy hook post-tool-use` reads the PostToolUse payload (`tool_name`, `tool_input.command`, `tool_response.stdout`). It does nothing, and calls no server, unless the call is a Bash call of `gh pr create` that printed a pull request URL. It then calls `attempt.recordPullRequest` with the last URL printed.

| Answer | What the hook does |
| --- | --- |
| `linked` | Prints one line and exits 0. |
| `retry` | The forge did not answer and the server wrote nothing. The hook prints a line and exits 0, and the [pull request watch](./v1-lifecycle.md#the-pull-request-watch) links it later. |
| `refused` with `linked-elsewhere` | Exits 2, so Claude Code shows the line to the agent. |
| any other `refused` | Exits 1. |

## The hook plug-in

`apps/cli/hook-plugin/` is the plug-in that the agent image installs. Its `hooks/hooks.json` runs `boxxy hook session-start` on `startup` and `resume`, and `boxxy hook post-tool-use` after each Bash call. A test checks that each command it names exists. atc refuses `pluginDirs` on an imp, so the image holds the plug-in and the `boxxy` binary, and the agent config names the plug-in's path. The image takes both from the CLI's GitHub release, as [the CLI release assets](./release.md#the-cli-release-assets) describes.

## How a scripted session runs the CLI

`createTestCLI` in `system-tests/src/test-utils/` starts the real server on the memory store, with the fake worker, forge and clock, and runs `runCLI` against it with no network. The system tests live in `@boxxy/system-tests`, because a test of two apps belongs to neither (see [layout](./layout.md#dependency-rules)). The tests inside `apps/cli` use a fake `fetch` only. Its fetch stands in for the broker: a request for a session or hook procedure goes to the worker listener with the worker token, and any other request goes to the owner listener. A test sets who the next request is from with `server.callerProof.setCaller`, runs `boxxy hook session-start` and `boxxy hook post-tool-use` with a payload on stdin, runs `boxxy attempt close-out` with the body on stdin, and ticks the runner with `server.tick()`.
