# The CLI and the hooks

`boxxy`, the command in `@boxxy/cli`, is how people and agents call the server. The owner runs it at
a terminal. An agent runs its `attempt` commands inside a session to read its task and send its
close-out. A hook plug-in in the agent image runs two more commands for the agent: one installs the
attempt's skills and binds the session when it starts, and one links each pull request the agent
opens. The server makes every decision; a command reads its flags, calls one procedure and prints
the answer. Read this doc before you add a command, change a hook, or change what a session needs on
its machine.

[API and auth](./api-and-auth.md) covers the listeners the CLI reaches and who may call each
procedure. [Attempts](../work/attempts.md) covers the attempt a session's commands act on.
[Release](../repo/release.md) covers how the binary and the plug-in reach the agent image. The
[overview](../overview.md#terms) defines the shared terms.

## Setup

The CLI reads two environment variables and no config file:

- `BOXXY_URL`, required: the server's address, `http` or `https`, with an optional path prefix the
  CLI puts before `/rpc`. At a terminal it points at the owner listener. In a session, atc sets it
  from the session's auth profile, to the host name the imp broker owns
  ([the paths](./api-and-auth.md#the-paths)).
- `BOXXY_SKILLS_URL`, optional: where the session-start hook fetches the skills repository from. It
  defaults to `https://github.com`.

The CLI sends no token and no identity header: the owner listener needs none, and in a session the
broker adds both on the way out. It calls the server through the contract's typed client over Bun's
`fetch`, which honours `HTTPS_PROXY`, so the CLI works behind a proxy.

## Commands

Each procedure has exactly one command, and a test fails when one has none or two. The contract's
access table holds each command's usage line, so `boxxy --help` and `boxxy <group> --help` print
them, and `boxxy --version` prints the CLI's version.

A command prints the server's answer as JSON on stdout, including a `refused`, `rejected` or `fault`
answer. A few print less: `attempt evidence` prints the evidence ID, `attempt close-out` prints the
ID of the fact it recorded and one stderr line per problem the parser found, `auth enroll` prints
the one-time link, and `auth clients add` prints the client ID. A typed error prints
`error: <code>: <message>` on stderr. A script branches on the exit code:

| Exit | When                                                                                        |
| ---- | ------------------------------------------------------------------------------------------- |
| 0    | the server did what the command asked                                                       |
| 1    | the server answered `refused`, `rejected` or `fault`, or threw a typed error                |
| 2    | the command line is wrong, `BOXXY_URL` is missing, or an `attempt` command found no attempt |

A command checks `BOXXY_URL` before it reads stdin. The hooks set their own exit codes, below.

The owner's item commands have a few rules the usage lines don't show:

- **The body** comes from `--body <text>` or `--body-file <path>`, where `-` reads stdin. Giving
  both exits 2, and `item edit` with neither keeps the body.
- **Held items:** `item file --held "<reason>"` files the item
  [held](../work/pipeline.md#derived-item-state), and `item release <item>` releases it.
  `item list --held` is the same as `--state held`, so it exits 2 beside another `--state`.
- **The security mark:** `item file --security` sets it, `item edit --security` and `--no-security`
  set and clear it, both together exit 2, and neither keeps it.
- **Acceptance edits replace the whole list.** Each `item edit --acceptance` value is one criterion,
  and together they replace the whole list, so a criterion missing from every value is dropped. A
  value of `[c-3] new text` keeps criterion `c-3` and its evidence with new text, an unknown ID is
  refused, and a value without an ID adds a criterion.
- **`item show`** prints the item with its body and one revision per edit, each with its time and
  the fields it set.
- **`plan defer --until`** takes an ISO 8601 time with an offset, which the server checks.

The `attempt` commands run inside a session and take no session argument, because the server finds
the session from the [proven caller](./api-and-auth.md#the-proven-caller). `attempt evidence` and
`attempt close-out` first call `attempt.current` for the attempt ID. `attempt list-items` and
`attempt show-item <item>` read other items of the session's own repo; `list-items` takes the flags
of `item list` except `--repo` and `--held`. A session that runs `item list` or `item show` gets
`FORBIDDEN`.

Right after a session starts, the server may not have its attempt yet: the runner records the
session's caller only once atc answers the spawn, and the agent can be quicker. An `attempt` command
then exits 2 with a message asking the agent to try again; the CLI itself never retries. The hooks
wait for the attempt on their own.

## The session-start hook

`boxxy hook session-start` reads Claude Code's SessionStart payload on stdin and gets the session
ready to work:

1. It calls `attempt.current` until the server has an attempt for the session, waiting between a
   fixed number of tries, and exits 1 when every try finds none.
2. It installs each skill the attempt's [recipe](../work/pipeline.md#recipes-and-skills) lists into
   `<cwd>/.agents/skills/<skill>`, at the commit the rules file pins
   ([installing skills](#installing-skills)).
3. It calls `attempt.bindSession` with the session ID from the payload, the agent product
   `claude_code`, and any missing skills.
4. On a `bound` answer it prints Claude Code's
   [SessionStart hook JSON](https://code.claude.com/docs/en/hooks#sessionstart-decision-control) and
   exits 0. Every other answer exits 1.

The hook sets `reloadSkills` whenever the recipe lists a skill, because Claude Code looks for skills
before the hook ends, and without the reload the agent's first prompt would run without them. It
also puts a guide in `additionalContext`, because a recipe's prompt can leave out how to close out,
and a session that ends without a valid close-out fails. The guide gives the phase, the outcomes its
close-out can send, where the agent finds its task and input, the session commands, and the evidence
kinds for a screenshot, a measurement and a long log.

When a skill is missing, the server answers `skill-missing` and moves the attempt to `closing`, the
runner settles it as failed with `skill-missing`, and the hook exits 1 naming the missing skills.

### Installing skills

The hook runs `git` as a process, so the fetch uses git's own proxy settings. In a new scratch
folder it runs `git init` and a depth-1 `git fetch` of the pinned commit from
`<BOXXY_SKILLS_URL>/<owner>/<repo>.git`, then checks out each `skills/<skill>` from `FETCH_HEAD` and
copies it into the workspace. It first strips git's environment of every variable
`git rev-parse --local-env-vars` lists, such as `GIT_DIR`, and of `GIT_CEILING_DIRECTORIES`, so git
writes only in the scratch folder. A recipe with no skills skips the fetch.

The hook writes into `.agents/skills/` and never through `.claude/skills`. Most zgeoff repositories
commit `.agents/skills/` and link `.claude/skills` to `../.agents/skills`, so Claude Code loads the
copies through the link. git refuses a path that runs through a symbolic link, so the hook's git
calls name `.agents/skills/<skill>`. In a workspace without `.agents` or `.agents/skills`, the hook
makes each absent folder, one at a time, and stops at a part that is a symbolic link or a file. A
repository whose `.claude/skills` links elsewhere, such as zgeoff/skills, which links it to
`../skills`, still gets the copies, but Claude Code loads that repository's own skills.

When the workspace is in a git repository, the install changes nothing that `git status` shows
there, so the agent's pull request and the repository's own checks don't see the installed skills:

- When the repository tracks a file in `.agents/skills/<skill>`, the hook keeps the committed skill
  and copies nothing. The repository's checks and docs expect its own version of the skill.
- Before any copy, the hook lists each skill it will copy in the repository's `info/exclude`, as
  `/<path from the top>/.agents/skills/<skill>/` with glob characters escaped. It adds no line for a
  folder the repository already ignores, as `git check-ignore` reports. Checks that list untracked
  files, such as `git ls-files --others --exclude-standard`, then skip the copied folders.
- Worktrees of one repository share its `info/exclude`, so the hook updates the file under a lock,
  and never removes a line: a skill that one worktree commits can be an untracked copy in another. A
  line never hides a change to a tracked file. The hook refuses to write when `info/exclude` or its
  lock file is a symbolic link, because the write would follow the link.

The hook treats the workspace as outside any repository only when no folder from the workspace up
holds a `.git`. Then it runs no git in the workspace and writes no exclude. In any workspace the
hook makes and checks `.agents/skills/` before it writes to git's files, so a workspace where a part
of that path is a symbolic link or a file is left as it was, git's files included. A folder the hook
made stays when a later step fails, and `git status` never shows an empty folder.

A skill counts as installed only when its folder in the workspace holds a `SKILL.md`. The copy
replaces any earlier untracked copy, so a [kept session](../work/sessions.md#the-kept-session) that
resumes under a new pin gets the new files. The hook reports a skill missing when its name or the
pin is malformed, the fetch fails, the copy fails, the copied or committed folder has no `SKILL.md`,
or the path is unsafe: `.agents` or `.agents/skills` is a file or a symbolic link, the hook can't
make either folder, or `.agents/skills` resolves outside the workspace. It also reports a skill
missing, and copies nothing, when git fails in the workspace's repository or the hook can't write
`info/exclude`, or when either file is a symbolic link. A failed fetch makes every listed skill
missing, because the hook can't tell a skill the repository lacks from one it couldn't read. The
copy deletes the skill's folder first, and a link on the path would aim that delete outside the
workspace, so the hook checks the path just before each copy, after git has run, and touches nothing
for a skill whose path fails.

## The pull request hook

`boxxy hook post-tool-use` reads Claude Code's PostToolUse payload. It does nothing unless the call
was a Bash `gh pr create` that printed a pull request URL. Then it waits for the session's attempt
as the session-start hook does, and calls `attempt.recordPullRequest` with the last URL printed.

| Answer                            | Meaning                                                              | Exit |
| --------------------------------- | -------------------------------------------------------------------- | ---- |
| `linked`                          | the server linked the pull request to the attempt                    | 0    |
| `retry`                           | GitHub didn't answer, and the server wrote nothing                   | 0    |
| `refused` with `linked-elsewhere` | the pull request belongs to another item                             | 2    |
| any other `refused`               | the server refused the link, for example because the attempt is over | 1    |

After a `retry`, the [pull request watch](./github.md#the-pull-request-watch) links the pull request
later. `linked-elsewhere` exits 2 because Claude Code shows a PostToolUse hook's stderr to the agent
only on exit 2, and the agent must learn it opened a pull request for the wrong item.

## The hook plug-in

`apps/cli/hook-plugin/` is the plug-in the agent image installs. It runs `boxxy hook session-start`
on `startup` and `resume`, and `boxxy hook post-tool-use` after each Bash call, and a test checks
that the CLI has each command the plug-in calls. atc refuses its spawn call's `pluginDirs` option
for a session in an imp, so boxxy can't hand the plug-in to a session at start. The image therefore
holds the plug-in and the `boxxy` binary, and its agent config points at the plug-in's folder. Both
come from the CLI's [GitHub release](../repo/release.md#the-cli-release-assets).

## Testing the CLI

The CLI's tests start the real server in-process, on the memory store with a fake atc worker, forge
and clock, and run the CLI against it with no network. The test helper stands in for the imp broker:
it sends each session or hook procedure to the worker listener with the worker token, and every
other procedure to the owner listener. A test sets the proven caller and ticks the runner through
the server's test helpers. These tests live beside the CLI code they drive, and reach the server
only through its test helpers ([dependency rules](../repo/layout.md#dependency-rules)). The CLI's
other tests use a fake `fetch`.
