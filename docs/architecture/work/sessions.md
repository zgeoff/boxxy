# Agent sessions

Every attempt with an agent runs in one atc session, and boxxy reaches atc only through the worker
port. This doc covers what boxxy does with a session beyond one attempt's states: keeping a session
for the rework round, forgetting sessions once their attempts settle, handling a target with no room
for another session, and the atc adapter that implements the port.

[Attempts](./attempts.md) covers the attempt states, the readings and settle, which this doc takes
as given. [The pipeline](./pipeline.md) covers the edges and limits that decide when a session is
kept.

## The kept session

One rules line turns it on: the `changes-requested` edge carries `resume: true`. A verify recipe
with `session: builder` keeps the build's session too: the claim of the verify wakes it, and the
verify keeps it again when it settles `verified` or `failed`, for the rework
([the verifier](../../design/boxxy/review-and-merge.md#the-verifier)).

1. A build attempt settles `built`. boxxy stops its session and keeps it, and records the kept
   session on the item.
2. The review runs in its own session.
3. When the review asks for changes, the claim of the next build attempt wakes the kept session and
   sends the [launch prompt](./pipeline.md#the-launch-prompt) of the new attempt as a message,
   rendered from the recipe's `reworkPrompt` when it has one. The prompt carries the findings. The
   new attempt binds to the same atc session. The first bind that carries the agent session, from
   the start's answer, a reading or the session-start hook, moves the agent session from the attempt
   that kept it to the new attempt: boxxy lets a live attempt take over an agent session only from
   an attempt that succeeded on the same atc session.
4. When the wake fails or the session is gone, boxxy spawns a fresh session, and the `started` fact
   says so. Either way the item's kept session is cleared when the new attempt starts. A wake
   refused for capacity settles the attempt as `no-capacity` and keeps the kept session. A wake with
   no answer goes to the reconcile table and keeps the kept session until the table moves the
   attempt to running; that move clears the kept session, as a start does. A respawn from the
   reconcile table wakes the kept session again, because a lost reply can leave it running, and a
   fresh spawn would run beside it.

A kept session holds no seat while it sleeps. It is state of the item, outside the attempt machine:
the first attempt has succeeded, and the second starts with the plain claim and start events. One
atc session then carries two attempts, so the session ID alone does not say which attempt a call is
for. The resumed session reads `attempt.current` again and gets the new attempt's ID. boxxy forgets
a kept session when the item is done or closed, and `timeouts.keptSessionHours` (in
`@boxxy/dispatch`) after it was kept, unless a live attempt runs on it.

## Cleanup

The runner tick removes the session of a settled attempt that is not kept:

| Attempt                                                     | What boxxy does                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| succeeded                                                   | forgets the stopped session at once; on an imp target the machine is destroyed              |
| failed review                                               | forgets the stopped session on the next tick, because nothing resumes a review session      |
| any other failed attempt, such as a design, build or triage | keeps the stopped session for `timeouts.failedSessionHours`, for diagnosis, then forgets it |

boxxy tries a failed forget again on the next tick, and never forgets a stray session before it has
stopped. A stray whose stop is still unconfirmed `timeouts.strayHours` after it strayed goes to
cleanup: on each tick, cleanup sends the stop, and forgets the session once the stop is confirmed,
because atc refuses to forget a live session. The attempt row records the forget, through the
attempt move `session-forgotten`. No fact does, because no fact type for cleanup exists.

## Capacity and the usage limit

- **A spawn refused for capacity** settles the attempt as failed with `no-capacity`. The item stays
  ready, and the pool backs off for `timeouts.capacityBackoffSeconds`.
- **A wake refused for capacity** is no failure. The attempt sleeps again and keeps its wake
  request, and the pool backs off for `timeouts.capacityBackoffSeconds`.
- **The backoff holds back start picks and wake picks.** Without the hold on wake picks, the claim
  loop of one tick picks the refused wake again and never reaches the readings. The server keeps the
  backoff in its own memory, one end time per pool, and a second hold keeps the later end. A restart
  forgets every hold, and the next refusal holds the pool again.
- **The claim loop has two more guards.** No item is claimed twice in one tick, and an error in the
  loop ends the loop and not the tick.
- **The usage limit.** Dispatch acts on a running reading that carries a reset time for the
  account's usage limit: the attempt moves to `closing`, settles as failed with `usage-limit`, and
  the pool backs off until the reset time, for `timeouts.usageLimitBackoffHours` at most. A reset
  time that is not in the future holds the pool for the whole of that cap. The atc worker adapter
  never gives a reading with a reset time, because atc reports no usage limit. A session at the
  account limit therefore runs into the other bounds: in agent mode it falls silent and settles as
  `stalled` at `afterSilentMinutes`, or as `timed-out` when the step's limit comes first, and either
  failure counts against `maxAttempts`. In attended mode it goes to sleep. The pool backoff never
  starts from the usage limit, so the next claim spawns into the same limit.
- **Trusted folder.** The atc worker adapter checks, before each spawn in a configured folder, that
  the agent trusts the folder. It refuses the spawn otherwise, because a session in an untrusted
  folder waits at a dialog and runs no turn. A spawn from a git source skips the check, as
  [the atc worker](#the-atc-worker) says.

## The atc worker

`@boxxy/worker-atc` implements the worker port on the atc gateway's MCP tools. Its client calls them
over streamable HTTP at the gateway's `/mcp`, with the service token as the bearer and the gateway's
public host name as `Host`, because the gateway answers 403 to any other host. The client parses
each tool's structured result with a zod schema, and refuses a result that fails it as
`malformed_answer`, so no field of an unread shape reaches a reading. A 401 reads as `unauthorized`,
a 403 as `forbidden`, and a 403 `insufficient_scope` as `insufficient_scope` with the scope the
gateway names; none of their messages holds the token.

A read from `atc_session_get` must carry `lastAttachedAt` and both `lifecycle` fields, which atc
declares in the tool's output schema, so a read without them is `malformed_answer`. The other tools'
session entries may leave those fields out, and the parse checks them when present. The client
follows no redirect, so the bearer goes only to the configured address. A response body over
`maxBodyBytes` (in the adapter's `create-atc-mcp-client.ts`), by its `content-length` or by the
bytes counted as it streams, fails as `malformed_answer` before any parse reads it.

| Port method  | atc tools                                                                                                                                                                                                                                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start`      | for a folder, the trusted-folder check; for a git source with a `credentialRef`, the credential check; then `atc_session_spawn` with the target, the folder as `cwd` or the git source as `workspace`, name, prompt, the agent ID from the recipe, model, effort, and the attempt ID as the idempotency key |
| `reconcile`  | `atc_session_get`; for an attempt with no atc session, first `atc_sessions_list`, to find the latest session with the attempt's spawn name                                                                                                                                                                  |
| `suspend`    | `atc_session_get`, then `atc_session_stop` unless the session shows activity after the idle time                                                                                                                                                                                                            |
| `resume`     | `atc_session_get`, then `atc_session_adopt` unless the agent process runs, then `atc_session_get`                                                                                                                                                                                                           |
| `stop`       | `atc_session_stop`, which stops the session and keeps its record                                                                                                                                                                                                                                            |
| `forget`     | `atc_session_forget` without `stop`, so atc refuses a live session; a target that destroys its hosts answers a confirm token, and a second call sends it                                                                                                                                                    |
| `resumeKept` | the tools of `resume`, then `atc_message_send` with the prompt, keyed by the new attempt's ID; a refused message stops the session again, so the claim's fresh spawn does not run beside it; when that stop fails, `resumeKept` answers `unknown`, so no fresh spawn starts                                 |

The service token `service:boxxy` has the scopes `read` and `message` for the reads and the message,
`spawn` for `atc_session_spawn` and `atc_session_adopt`, and `kill` for `atc_session_stop` and
`atc_session_forget`. The daemon reaches a session for the token only on a target that its
`principals` key lists for `service:<name>`.

A reading comes from `atc_session_get`, by the session's `lifecycle.harness`, because atc lists a
process asleep inside its host as `exited` too:

| Harness     | Reading                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `running`   | `running`. The adapter sets the reading's `attention` from the atc state: `running` gives `working`, `needs_you` gives `needs-input`, and `done` gives `turn-ended`. The reading's `lastActivityAt` is the later of atc's `lastActivityAt` (the last trail event) and `lastAttachedAt`. atc writes a trail event for each hook of the agent, such as the start and the end of a turn, and none for a tool call. The reading's usage-limit reset time is always empty. |
| `suspended` | `suspended`. The reading's `asked` (whether anyone asked the host to sleep) is true unless `lifecycle.desired` is `run`, which atc keeps when the host slept by itself.                                                                                                                                                                                                                                                                                               |
| `exited`    | `ended`                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

The adapter reads a `no_such_session` refusal as `absent`, and `stop` and `forget` answer `absent`
for it. An `atc_session_spawn` refused with `no_such_session` answers `unknown`: after a daemon
restart, atc refuses a repeated spawn with that code when the first spawn under the same idempotency
key ran, until the daemon lists the restored session again. A `reconcile` that gets no answer from
atc throws, so that a lost connection never settles a running attempt as `session-lost`.

atc writes a refused tool call as `structuredContent: { code, problem? }` beside a text for people.
The adapter reads the code and the problem from that structured part, and keeps the text as the
message. A refusal without the structured part, as an older atc sends it, takes its code from the
text's `<code>: ` prefix and has no problem.

A spawn or a wake refused with `host_unavailable` and the problem `ram_budget_exceeded` answers the
cause `capacity`: atc's imp provider puts impd's own error code there in lower case, and impd
answers `RAM_BUDGET_EXCEEDED` when no budget is left for another machine. Every other refusal that
carries an atc error code answers `refused` with the cause `other`, and so does a malformed result.
The reason of a refused spawn or wake reads `<code> (<problem>): <message>`, with no problem when
atc gives none, and the runner logs it. A JSON-RPC error that refuses the request before it runs
(parse error, invalid request, method not found or invalid params) answers `refused` as
`protocol_error`. A call that gets no atc answer, such as a timeout, a dropped connection, an HTTP
5xx or any other JSON-RPC error, or `outcome_unknown` or `idempotency_key_unknown`, answers
`unknown`, because atc may have run it.

The server's `spawn.repos` gives each repo a folder on the target or a git source, a URL and a ref.
`item.file` refuses a repo that `spawn.repos` does not name. When a repo leaves `spawn.repos` after
its items were filed, the claim passes over those items, so they wait and the claim takes the next
pick. A target whose machines start empty, such as an imp target, needs the git source.

A spawn from a git source sends `workspace: { kind: 'git', url, ref }` and
`trustClonedWorkspace: true`, and no `cwd`. atc clones the ref into a folder that it picks, and
trusts that clone alone on a target whose identity a broker signs, so the agent never waits at the
trust dialog. The adapter keeps no record of the clone's folder, because no later call needs it: a
resume and a wake name the session, and the hooks read the folder from Claude Code's payload.

The atc daemon does the clone, before the session exists, so the machine's own network and the
broker's grants never reach it. The git source of a private repository names an environment variable
of the daemon in `credentialRef: { name }`, and never holds the token. The adapter sends it in atc's
git workspace as `credentialRef: { kind: 'env', name }`, and the daemon reads the token from that
variable.

The config refuses a URL with a credential. The server passes the adapter each configured git source
that has a `credentialRef`, and the adapter refuses a spawn whose source pairs a variable name with
any other URL, reason `git source credential not configured`, so an attempt row cannot pick the
variable or the URL that the token goes to. A source with no `credentialRef` clones with no token.
The attempt row stores the spawn request as claimed, so a respawn sends the same source under the
same idempotency key after the config changes.

The trusted folders come from the app's configuration, by worker target: a folder is trusted when it
is a listed folder or lies inside one. atc has no call that reads which folders an agent trusts.

The adapter reads the caller identity from the session's `host` field, which atc reports with the
daemon feature `session.host` and the gateway passes on unchanged: `name`, and `id` and `issuer`
when atc knows them. The caller is the host's `issuer` with the host's `id` as the subject. The
subject is the machine's ID as its issuer gives it, never the name. A session with no `host`, such
as one from a daemon that lacks `session.host`, or a host without an `id` or an `issuer`, has no
caller, because the identity check refuses a host that lacks either. Sub-sessions on one machine
share the same `host`.
