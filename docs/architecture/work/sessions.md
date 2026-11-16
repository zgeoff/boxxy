# Agent sessions

Every attempt with an agent runs in one atc session. atc's daemons run the sessions on the worker
target, the atc target set in `spawn.target` of the server config; on an imp target, each session
gets a fresh imp. boxxy reaches the daemons only through the atc gateway's MCP tools, by the atc
worker, its adapter for the worker port. This doc covers what boxxy does with a session beyond one
attempt's states: keeping it for the rework round, forgetting it once its attempt settles, handling
a target with no room for it, and the atc worker.

[The overview](../overview.md#terms) defines the terms this doc uses, such as seat, pool, rules
file, fact, atc, imp broker and proven caller. The atc session is atc's record of one running agent,
which boxxy starts, stops and forgets. The agent session is Claude Code's own session ID inside it,
which boxxy learns when it binds the agent session to an attempt.

[Attempts](./attempts.md) covers the attempt states, the readings and settle, and
[the pipeline](./pipeline.md) the edges, recipes, limits and design modes.

## The kept session

boxxy keeps the stopped atc session of a succeeded attempt on the item, so that a later attempt of
the item can wake it and carry on with the agent's context. It keeps the session in these cases:

- An edge of the item's pipeline leads back to the attempt's phase with `resume: true`, such as a
  `changes-requested` edge from review to build.
- The attempt is a build, and a recipe of the item's kind has `session: builder`.
- The attempt ran a recipe with `session: builder`, such as a verify that grades the build in the
  builder's session ([the verifier](../../design/boxxy/review-and-merge.md#the-verifier)).

A verify attempt settles as succeeded with either close-out result, `verified` or `failed`
([settle](./attempts.md#settle)), so both results keep the session again for the rework.

The runner wakes the kept session in place of a spawn when the claimed phase's recipe has
`session: builder`, or when the item came back to that phase through a `resume: true` edge. A rework
round runs like this:

1. A build attempt settles `built`. boxxy stops its session and records it on the item.
2. The review runs in its own session, and settles `changes-requested`.
3. The runner claims the next build attempt, wakes the kept session, and sends it the new attempt's
   [launch prompt](./pipeline.md#the-launch-prompt), with the findings, from the recipe's
   `reworkPrompt` when it has one.
4. The new attempt takes over the agent session. boxxy binds an agent session to an attempt at the
   first report of its ID: the start's answer, a reading, or the
   [session-start hook](../interfaces/cli-and-hooks.md#the-session-start-hook).

boxxy refuses to bind an agent session that another attempt holds. It makes one exception: the
holder succeeded on the same atc session, and the new attempt is live.

The runner spawns a fresh session when the item has no kept session, or when atc refuses the wake
for a cause other than capacity. The `started` fact records that fallback. When the new attempt's
session starts, by either path, boxxy clears the kept session from the item. These cases leave the
kept session on the item:

- **atc refuses the wake for capacity.** The attempt settles as `no-capacity`, as a refused spawn
  does, and the next claim tries the wake again. A fresh spawn would meet the same lack of room.
- **The wake gets no answer.** The attempt moves to `reconciling`, and boxxy moves it on by
  [the reconcile table](./attempts.md#the-reconcile-table). The move to `running` clears the kept
  session, as a start does. A respawn from `reconciling` wakes the kept session again instead of
  spawning, because a lost reply can leave the woken session running, and a fresh spawn would run
  beside it.

A stopped kept session holds no seat, and the attempt states leave it out, because it belongs to the
item: the attempt that wakes it goes through the same claim and start moves as any other. One atc
session then carries two attempts, so boxxy's server takes each call from the session for the latest
attempt that the session carries
([the proven caller](../interfaces/api-and-auth.md#the-proven-caller)). The woken agent runs
`boxxy attempt current` again to get the new attempt's ID.

boxxy forgets a kept session when the item is done or closed, or `timeouts.keptSessionHours` after
it was kept, whichever comes first. `timeouts` is the timeouts module of `@boxxy/dispatch`. After an
unanswered wake, a live attempt runs on a kept session that the item still records, so cleanup never
forgets a kept session whose latest attempt is live and is another attempt.

## Cleanup

atc keeps the record of a stopped session until boxxy forgets it. Cleanup is the last session step
of each tick, after the readings and the stray stops. In it, the runner forgets each kept session
that is due, and the session of a settled attempt that is not kept: a succeeded attempt, or a failed
review, at the first cleanup after the settle, because nothing resumes a review session. It keeps
the session of any other failed attempt, such as a design, build or triage, for
`timeouts.failedSessionHours`, for diagnosis. A forget that atc does not confirm changes nothing,
and the runner tries it again at the next cleanup. On an imp target, atc destroys the session's imp
when boxxy forgets the session ([the atc worker](#the-atc-worker)).

atc refuses to forget a live session, so a session that may still run needs a confirmed stop first.
That happens to a stray, an attempt that settled while its session may still run: the give-up rule
settled it, or its spawn showed no session in time
([closing and the give-up rule](./attempts.md#closing-the-stop-and-the-give-up-rule)). For
`timeouts.strayHours` after the attempt strayed, the tick's stray step sends the stop on each tick,
and cleanup forgets the session once the stop is confirmed. After that, cleanup itself sends the
stop on each tick, and forgets the session in the same pass once atc confirms the stop. boxxy
therefore never forgets a stray's session before it has stopped.

boxxy records each forget on the attempt row as `session-forgotten`, a move of the
[attempt machine](./attempts.md#the-states). boxxy sends no fact for a forget, because
[the fact catalog](../interfaces/facts-and-pepys.md#the-fact-catalog) has no type for cleanup.

## Capacity and the usage limit

atc refuses a session when the worker target has no room for one, and the atc worker answers that
refusal with the cause `capacity` ([refusals](#refusals)). The same request would meet the same lack
of room on the next tick. The runner therefore holds back the attempt's pool, the pool that the
claim took the attempt from, for `timeouts.capacityBackoffSeconds`. While the hold lasts, the claim
starts no item from that pool and wakes none of its sleeping attempts.

- **A spawn refused for capacity fails the attempt.** It settles as `no-capacity`, which does not
  count against `maxAttempts`, and the item stays ready. The wake of a kept session counts as a
  spawn here.
- **A wake of a sleeping attempt refused for capacity fails nothing.** The attempt sleeps again and
  keeps its wake request ([sleep and wake](./attempts.md#sleep-and-wake)).
- **The runner keeps each hold in its own memory.** It keeps one end time per pool, and a second
  hold of a pool keeps the later end. A restart drops every hold, and the next refusal holds the
  pool again.
- **The claim loop claims no item twice in one tick,** so it never resends a refused wake in that
  tick. An error in the loop ends the loop and not the tick.
- **Nothing detects the account's usage limit, so the next claim spawns into it.** atc reports no
  usage limit, so the atc worker never gives a reading with a reset time. boxxy ends a session at
  the limit by the other bounds of [the reconcile table](./attempts.md#the-reconcile-table). In
  agent mode ([design mode](./pipeline.md#design-mode)) the session falls silent, and boxxy settles
  it as `stalled` once it shows no activity for `afterSilentMinutes`, a setting in the `sleep` block
  of the rules file. It settles as `timed-out` instead when the step's `timeoutMinutes` comes first.
  Either failure counts against `maxAttempts`. In attended mode boxxy puts the session to sleep.
- **Dispatch keeps the usage-limit path for a worker that reports a reset time.** A running reading
  with one moves the attempt to `closing`, settles it as `usage-limit`, and backs the pool off until
  the reset time, for `timeouts.usageLimitBackoffHours` at most.

## The atc worker

`@boxxy/worker-atc` implements the worker port, the `WorkerKind` interface of `@boxxy/model`, on the
atc gateway's MCP tools, as atc's service principal `service:boxxy`. Its token needs the scopes
`read`, `message`, `spawn` for spawn and adopt, and `kill` for stop and forget. A daemon serves the
token only on the targets that the daemon's own `principals` key lists for `service:boxxy`.

The worker's client calls the gateway's `/mcp` over streamable HTTP with the service token as the
bearer. It follows no redirect, so the bearer goes only to the configured address. It refuses a tool
result that fails its schema or size cap as `malformed_answer`, before boxxy reads any field of it.

| Port method  | atc tools, in order                                       |
| ------------ | --------------------------------------------------------- |
| `start`      | `atc_session_spawn`                                       |
| `reconcile`  | `atc_session_get`                                         |
| `suspend`    | `atc_session_get`, `atc_session_stop`                     |
| `resume`     | `atc_session_get`, `atc_session_adopt`, `atc_session_get` |
| `stop`       | `atc_session_stop`, which keeps the session's record      |
| `forget`     | `atc_session_forget`                                      |
| `resumeKept` | the tools of `resume`, then `atc_message_send`            |

- `start` runs the folder check or the credential check first
  ([where a session works](#where-a-session-works)). It sends the attempt ID as the idempotency key,
  so a respawn after a lost answer never starts a second session.
- `reconcile` of an attempt whose spawn got no answer first finds its session with
  `atc_sessions_list`: the latest session with the attempt's spawn name.
- `suspend` skips the stop when the session shows activity after the time boxxy passes, the time the
  session began to wait, so a session that went back to work keeps running.
- `forget` never passes `stop`, so atc refuses to forget a live session. On a target that destroys
  its hosts, such as an imp target, atc answers the first call with a confirm token, and the worker
  sends it in a second call, which destroys the host.
- `resumeKept` keys the message by the new attempt's ID. When atc refuses the message, the worker
  stops the session again, so the fresh spawn that the runner sends next does not run beside it.
  When that stop fails, `resumeKept` answers `unknown`, so no fresh spawn starts.

### Readings

The worker builds a reading from `atc_session_get`, by the session's `lifecycle.harness` field.
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
- A suspended reading's `asked`, whether anyone asked the host to sleep, is true unless
  `lifecycle.desired` is `run`. atc keeps `run` when the host slept by itself.

The worker reads a `no_such_session` refusal as `absent`, and `stop` and `forget` answer `absent`
for it. The worker answers an `atc_session_spawn` refused with `no_such_session` as `unknown`: after
a daemon restart, atc refuses a repeated spawn with that code when the first spawn under the same
idempotency key ran, until the daemon lists the restored session again. A `reconcile` that gets no
answer from atc throws, so that a lost connection never settles a running attempt as `session-lost`.

### Refusals

atc returns a refused tool call with a code, and sometimes a problem, in `structuredContent`. The
worker reads both from there, or the code alone from the text's `<code>: ` prefix when the
structured part is missing. A refused start or wake carries the cause `capacity` or `other`.

- The worker answers a spawn or a wake refused with `host_unavailable` and the problem
  `ram_budget_exceeded` as `refused` with the cause `capacity`. atc's imp provider puts the error
  code of impd, the daemon that runs imps, in lower case in `problem`, and impd answers
  `RAM_BUDGET_EXCEEDED` when no budget is left for another imp.
- The worker answers every other refusal as `refused` with the cause `other`. That covers a refusal
  with any other atc error code, a malformed result, and a JSON-RPC error that refuses the request
  before it runs (parse error, invalid request, method not found or invalid params), which the
  client gives the code `protocol_error`.
- The worker answers a call that gets no atc answer as `unknown`, because atc may have run it: a
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
worker runs the folder check: the folder must be a listed folder or lie inside one, and the worker
refuses the spawn otherwise.

A spawn from a git source sends `workspace: { kind: 'git', url, ref }` and
`trustClonedWorkspace: true`, and no `cwd`, so it needs no folder check. atc clones the ref into a
folder that it picks, verifies the clone, and trusts the clone's root alone, so the agent never
waits at the trust dialog.

The atc daemon clones the repository before the session exists, so the clone gets neither the
network of the session's imp nor the grants of the imp broker. For a private repository, the owner
puts the name of an environment variable of the daemon in the git source's
`credentialRef: { name }`, never the token. The worker sends it in atc's git workspace as
`credentialRef: { kind: 'env', name }`, and the daemon reads the token from that variable. A source
with no `credentialRef` clones with no token.

The server refuses to load a config whose git URL holds a credential. It passes the worker each
configured git source that has a `credentialRef`. Before a spawn from a git source, the worker runs
the credential check: it refuses a spawn whose source pairs a variable name with any other URL, with
the reason `git source credential not configured`. Nothing written on an attempt row can therefore
choose which variable a token comes from or which URL it goes to. The attempt row stores the spawn
request as claimed, and a respawn sends it again under the same idempotency key. After a config
change that drops the pairing, the worker refuses that respawn, and the attempt settles as
`spawn-refused`.

### The caller identity

The runner records a caller identity on each attempt row from the worker's answer, and the server
accepts a call from a session only from that caller
([the proven caller](../interfaces/api-and-auth.md#the-proven-caller)). The worker reads the caller
from the session's `host` field. atc reports that field with the daemon feature `session.host`, and
the gateway passes it on unchanged: `name`, and `id` and `issuer` when atc knows them.

The caller's issuer is the host's `issuer`. The caller's subject is the host's `id`, the machine's
ID that the issuer gave it. The worker never uses the host's `name`. A session has no caller when it
has no `host`, such as one from a daemon without `session.host`, or when its host lacks an `id` or
an `issuer`, because the identity check of the proven caller refuses such a host. Every atc session
on one machine shares that machine's `host`, and so its caller.
