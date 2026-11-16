# Agent sessions

Every attempt with an agent runs in one atc session. atc's daemons start and run the sessions, and
the atc gateway serves the daemons' tools over MCP. boxxy calls only the gateway, through the worker
port, the interface that each kind of worker host implements. This doc covers what boxxy does with a
session beyond one attempt's states: keeping a session for the rework round, forgetting sessions
once their attempts settle, handling a target with no room for another session, and the atc adapter.

[The overview](../overview.md#terms) defines the terms this doc uses. The atc session is atc's
record of one running agent, which boxxy starts, stops and forgets. The agent session is Claude
Code's own session ID inside it, which boxxy learns when it binds the agent session to an attempt.

[Attempts](./attempts.md) covers the attempt states, the readings and settle, which this doc takes
as given. [The pipeline](./pipeline.md) covers the edges, recipes and limits that decide when a
session is kept.

## The kept session

A kept session is the stopped atc session of a succeeded attempt, which boxxy records on the item so
that a later attempt of the item can wake it and carry on with the agent's context. boxxy keeps the
session of an attempt that settles as succeeded in these cases:

- An edge of the item's pipeline in the rules file leads back to the attempt's phase with
  `resume: true`, such as a `changes-requested` edge from review to build.
- The attempt is a build, and a recipe of the item's kind has `session: builder`.
- The attempt ran a recipe with `session: builder`, such as a verify that grades the build in the
  builder's session ([the verifier](../../design/boxxy/review-and-merge.md#the-verifier)). Both of
  the verify's outcomes, `verified` and `failed`, keep the session again for the rework.

A claim wakes the kept session in place of a spawn when its recipe has `session: builder`, or when
the item came back to the claimed phase through a `resume: true` edge. A rework round runs like
this:

1. A build attempt settles `built`. boxxy stops its session and records it on the item.
2. The review runs in its own session, and settles `changes-requested`.
3. The claim of the next build attempt wakes the kept session, and sends the new attempt's
   [launch prompt](./pipeline.md#the-launch-prompt) as a message, rendered from the recipe's
   `reworkPrompt` when it has one. The prompt carries the findings.
4. The new attempt takes over the agent session. boxxy binds an agent session to an attempt at the
   first report of its ID: the start's answer, a reading, or the
   [session-start hook](../interfaces/cli-and-hooks.md#the-session-start-hook). boxxy refuses to
   bind an agent session that another attempt holds, except when the holder succeeded on the same
   atc session and the new attempt is live.

The claim spawns a fresh session when the item has no kept session, or when atc refuses the wake for
a cause other than capacity. The `started` fact records the fallback. A start by either path clears
the item's kept session. These cases leave the kept session on the item:

- **atc refuses the wake for capacity.** The attempt settles as `no-capacity`, as a refused spawn
  does, and the next claim tries the wake again. A fresh spawn would meet the same lack of room.
- **The wake gets no answer.** The attempt moves to `reconciling`, and
  [the reconcile table](./attempts.md#the-reconcile-table) moves it on. The move to running clears
  the kept session, as a start does. A respawn from `reconciling` wakes the kept session again
  instead of spawning, because a lost reply can leave the woken session running, and a fresh spawn
  would run beside it.

A kept session holds no seat while it is stopped. It belongs to the item, and the attempt states
leave it out: the first attempt has settled, and the second goes through the same claim and start
moves as any other attempt. One atc session then carries two attempts, so the session ID alone does
not say which attempt a call is for. The server takes each session call for the latest attempt that
the session carries ([the proven caller](../interfaces/api-and-auth.md#the-proven-caller)), so the
woken agent runs `boxxy attempt current` again and gets the new attempt's ID.

boxxy forgets a kept session when the item is done or closed, or when `timeouts.keptSessionHours`
have passed since it was kept, whichever comes first. `timeouts` is the timeouts module of
`@boxxy/dispatch`. boxxy never forgets a kept session that a live later attempt runs on.

## Cleanup

atc keeps the record of a stopped session until boxxy forgets it. On each tick, the runner forgets
the session of each settled attempt that is not kept, and each kept session that is due:

| Attempt                                                     | What boxxy does                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| succeeded                                                   | forgets the stopped session at once; on an imp target the machine is destroyed              |
| failed review                                               | forgets the stopped session on the next tick, because nothing resumes a review session      |
| any other failed attempt, such as a design, build or triage | keeps the stopped session for `timeouts.failedSessionHours`, for diagnosis, then forgets it |

A forget that atc does not confirm changes nothing, and boxxy tries it again on the next tick.

A stray is an attempt that settled while its session may still run: the give-up rule settled it, or
its spawn showed no session in time
([closing and the give-up rule](./attempts.md#closing-the-stop-and-the-give-up-rule)). The runner
sends the stop to a stray for `timeouts.strayHours` after it strayed. After that, cleanup sends the
stop on each tick, and forgets the session once the stop is confirmed, because atc refuses to forget
a live session. boxxy therefore never forgets a stray's session before it has stopped.

The attempt row records each forget through `session-forgotten`, a move of the
[attempt machine](./attempts.md#the-states). boxxy never sends a fact for a forget, because
[the fact catalog](../interfaces/facts-and-pepys.md#the-fact-catalog) lacks a type for cleanup.

## Capacity and the usage limit

atc refuses a session when its worker target has no room for one, and the adapter answers that
refusal with the cause `capacity`. The runner then holds back the attempt's pool for a while, so the
next tick does not send the same refused request.

- **A spawn refused for capacity fails the attempt.** It settles as `no-capacity`, the item stays
  ready, and the pool backs off for `timeouts.capacityBackoffSeconds`. The wake of a kept session
  counts as a spawn here.
- **A wake of a sleeping attempt refused for capacity fails nothing.** The attempt sleeps again and
  keeps its wake request ([sleep and wake](./attempts.md#sleep-and-wake)), and the pool backs off
  for `timeouts.capacityBackoffSeconds`.
- **The backoff holds back start picks and wake picks.** Without the hold on wake picks, the claim
  loop of one tick picks the refused wake again and never reaches the readings. The server keeps the
  backoff in its own memory, one end time per pool, and a second hold keeps the later end. A restart
  forgets every hold, and the next refusal holds the pool again.
- **The claim loop has two more guards.** It claims no item twice in one tick, and an error in the
  loop ends the loop and not the tick.
- **Nothing detects the account's usage limit, so the next claim spawns into it.** atc reports no
  usage limit, so the atc adapter never gives a reading with a reset time. A session at the limit
  meets the other bounds of the reconcile table instead. In agent mode it falls silent and settles
  as `stalled` at `afterSilentMinutes`, or as `timed-out` when the step's time limit comes first,
  and either failure counts against `maxAttempts`. In attended mode it goes to sleep.
- **Dispatch keeps the usage-limit path for a worker that reports a reset time.** A running reading
  with one moves the attempt to `closing`, settles it as `usage-limit`, and backs the pool off until
  the reset time, for `timeouts.usageLimitBackoffHours` at most. A reset time in the past gets the
  whole of that cap.

## The atc worker

`@boxxy/worker-atc` implements the worker port, the `WorkerKind` interface of `@boxxy/model`, on the
atc gateway's MCP tools. Its client calls the gateway's `/mcp` over streamable HTTP, with the
service token as the bearer and the gateway's public host name as `Host`, because the gateway
refuses any other host. The client follows no redirect, so the bearer goes only to the configured
address, and no error message holds the token. The client checks each tool's structured result
against a schema and a size cap, and refuses a result that fails either as `malformed_answer` before
boxxy reads any field of it. `create-atc-mcp-client.ts` holds the cap and the codes it gives each
HTTP refusal.

| Port method  | atc tools                                                                                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start`      | the folder check or the credential check, then `atc_session_spawn`, with the attempt ID as the idempotency key                                                   |
| `reconcile`  | `atc_session_get`; for an attempt with no atc session, first `atc_sessions_list`, to find the latest session with the attempt's spawn name                       |
| `suspend`    | `atc_session_get`, then `atc_session_stop` unless the session shows activity after the time that boxxy passes: when the session began to wait                    |
| `resume`     | `atc_session_get`, then `atc_session_adopt` unless the agent process runs, then `atc_session_get`                                                                |
| `stop`       | `atc_session_stop`, which stops the session and keeps its record                                                                                                 |
| `forget`     | `atc_session_forget` without `stop`, so atc refuses a live session; on a target that destroys its hosts, atc returns a confirm token, and a second call sends it |
| `resumeKept` | the tools of `resume`, then `atc_message_send` with the prompt, keyed by the new attempt's ID                                                                    |

When atc refuses the message of `resumeKept`, the adapter stops the session again, so the fresh
spawn that the claim sends next does not run beside it. When that stop fails, `resumeKept` answers
`unknown`, so no fresh spawn starts.

The service token `service:boxxy` needs the scopes `read` and `message` for the reads and the
message, `spawn` for `atc_session_spawn` and `atc_session_adopt`, and `kill` for `atc_session_stop`
and `atc_session_forget`. A daemon serves the token only on the targets that the daemon's own
`principals` key lists for `service:boxxy`.

### Readings

The adapter builds a reading from `atc_session_get`, by the session's `lifecycle.harness` field.
atc's top-level state lists a session as `exited` whenever its agent process is not running, so a
process asleep inside its host reads `exited` there, the same as one that ended.

| Harness     | Reading     |
| ----------- | ----------- |
| `running`   | `running`   |
| `suspended` | `suspended` |
| `exited`    | `ended`     |

- A running reading's `attention` comes from atc's state: `running` gives `working`, `needs_you`
  gives `needs-input`, and `done` gives `turn-ended`.
- A running reading's `lastActivityAt` is the later of atc's `lastActivityAt` and `lastAttachedAt`.
  atc's value is its last trail event, and atc writes one for each hook of the agent, such as the
  start and the end of a turn, and none for a tool call.
- A suspended reading's `asked`, whether anyone asked the host to sleep, is true unless
  `lifecycle.desired` is `run`. atc keeps `run` when the host slept by itself.

The adapter reads a `no_such_session` refusal as `absent`, and `stop` and `forget` answer `absent`
for it. The adapter answers an `atc_session_spawn` refused with `no_such_session` as `unknown`:
after a daemon restart, atc refuses a repeated spawn with that code when the first spawn under the
same idempotency key ran, until the daemon lists the restored session again. A `reconcile` that gets
no answer from atc throws, so that a lost connection never settles a running attempt as
`session-lost`.

### Refusals

atc returns a refused tool call as `structuredContent: { code, problem? }` beside a text for people.
The adapter reads the code and the problem from the structured part, and keeps the text as the
message. When a refusal has no structured part, the adapter takes the code from the text's
`<code>: ` prefix.

- The adapter answers a spawn or a wake refused with `host_unavailable` and the problem
  `ram_budget_exceeded` as `refused` with the cause `capacity`. atc's imp provider puts the error
  code of impd, the daemon that runs imp machines, in lower case in `problem`, and impd answers
  `RAM_BUDGET_EXCEEDED` when no budget is left for another machine.
- The adapter answers every other refusal with an atc error code, and a malformed result, as
  `refused` with the cause `other`. It answers a JSON-RPC error that refuses the request before it
  runs (parse error, invalid request, method not found or invalid params) as `refused` with
  `protocol_error`. The runner logs the reason of each refused spawn or wake.
- The adapter answers a call that gets no atc answer as `unknown`, because atc may have run it: a
  timeout, a dropped connection, an HTTP 5xx, any other JSON-RPC error, `outcome_unknown` or
  `idempotency_key_unknown`.

### Where a session works

The server config's `spawn.repos` holds, for each repo, either a folder on the target, or a git
source made of a URL and a ref. `item.file` refuses a repo that `spawn.repos` does not name. When a
repo leaves `spawn.repos` after its items were filed, the claim passes over those items, so they
wait and the claim takes the next pick. A target whose machines start empty, such as an imp target,
needs a git source.

A session in a folder that the agent does not trust waits at Claude Code's trust dialog and runs no
turn. atc has no call that reads which folders an agent trusts, so boxxy keeps the list itself, in
the server config's `atc.trustedFolders`, by worker target. Before each spawn in a folder, the
adapter checks that the folder is a listed folder or lies inside one, and refuses the spawn
otherwise.

A spawn from a git source sends `workspace: { kind: 'git', url, ref }` and
`trustClonedWorkspace: true`, and no `cwd`, so it needs no folder check. atc clones the ref into a
folder that it picks, and trusts that clone alone on a target whose identity a broker signs, so the
agent never waits at the trust dialog. The adapter keeps no record of the clone's folder, because no
later call needs it: a resume and a wake name the session, and the hooks read the folder from Claude
Code's payload.

The atc daemon clones the repository before the session exists, so the clone gets neither the
network of the session's machine nor the grants of the imp broker. For a private repository, the
owner puts the name of an environment variable of the daemon in the git source's
`credentialRef: { name }`, never the token. The adapter sends it in atc's git workspace as
`credentialRef: { kind: 'env', name }`, and the daemon reads the token from that variable. A source
with no `credentialRef` clones with no token.

The server refuses to load a config whose git URL holds a credential. It passes the adapter each
configured git source that has a `credentialRef`, and the adapter refuses a spawn whose source pairs
a variable name with any other URL, with the reason `git source credential not configured`. Nothing
written on an attempt row can therefore choose which variable a token comes from or which URL it
goes to. The attempt row stores the spawn request as claimed, and a respawn sends it again under the
same idempotency key. After a config change that drops the pairing, the adapter refuses that
respawn, and the attempt settles as `spawn-refused`.

### The caller identity

The runner records a caller identity on each attempt row from the worker's answer, and the server
accepts a session call only from that caller
([the proven caller](../interfaces/api-and-auth.md#the-proven-caller)). The adapter reads the caller
from the session's `host` field. atc reports it with the daemon feature `session.host`, and the
gateway passes it on unchanged: `name`, and `id` and `issuer` when atc knows them. The caller is the
host's `issuer`, with the host's `id`, the machine's ID as its issuer gives it, as the subject. It
is never the name. A session has no caller when it has no `host`, such as one from a daemon without
`session.host`, or when its host lacks an `id` or an `issuer`, because the identity check of the
proven caller refuses such a host. Every atc session on one machine shares that machine's `host`,
and so its caller.
