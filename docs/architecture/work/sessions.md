# Agent sessions

Every attempt with an agent runs in one atc session on the worker target, the atc target set in the
server config's `spawn.target`. On an imp target each session gets a fresh imp, a cloud machine.
boxxy keeps a finished builder's session so the next rework round wakes it with the agent's context
intact, forgets each session once nothing needs it, and backs off a pool when the target has no
room. Read this doc before you change how boxxy keeps, cleans up or starts sessions, or how it talks
to atc.

Two IDs name a session. The atc session is atc's record of one running agent, which boxxy starts,
stops and forgets. The agent session is Claude Code's own session ID inside it, which boxxy learns
when it binds the session to an attempt.

[Attempts](./attempts.md) covers the attempt states, the session readings and settle.
[The pipeline](./pipeline.md) covers edges, recipes, limits and design modes. The
[overview](../overview.md#terms) defines the shared terms.

## The kept session

A [skipped attempt](./attempts.md#skipped-attempts) has no session, so every session read, stop and
forget passes over it.

boxxy keeps the stopped session of a succeeded attempt on the item, so a later attempt can wake it
and carry on where the agent left off. It keeps the session when:

- the item's pipeline has a `resume: true` edge back to the attempt's phase, such as review's
  `changes-requested` edge to build;
- the attempt is a build, and a recipe of the item's kind runs in the builder's session
  ([`session: builder`](./pipeline.md#recipes-and-skills));
- the attempt itself ran a `session: builder` recipe, such as a verify that grades the build in the
  builder's session.

A verify succeeds with either result, `verified` or `failed`, so both keep the session for the
rework.

A rework round runs like this:

1. A build settles `built`. boxxy stops its session and records it on the item.
2. The review runs in its own session and settles `changes-requested`.
3. The runner claims the next build, wakes the kept session in place of a spawn, and sends it the
   new [launch prompt](./pipeline.md#the-launch-prompt) with the findings.
4. The new attempt takes over the session once boxxy learns the agent session ID, from the start's
   answer, a reading or the
   [session-start hook](../interfaces/cli-and-hooks.md#the-session-start-hook). The agent runs
   `boxxy attempt current` again to get the new attempt's ID.

One atc session now carries two attempts, so the server takes each call from that session as a call
for its latest attempt ([the proven caller](../interfaces/api-and-auth.md#the-proven-caller)). boxxy
refuses to bind an agent session that another attempt holds, unless the holder succeeded on the same
atc session and the new attempt is live. A stopped kept session holds no seat and has no attempt
state of its own: it belongs to the item, and the attempt that wakes it goes through the same claim
and start as any other.

The runner spawns a fresh session instead when the item has no kept session, or when atc refuses the
wake for a cause other than capacity; the `started` fact records that fallback. Either way, the new
session's start clears the kept session from the item. It stays on the item in these cases:

- **atc refuses the wake for capacity.** The attempt settles `no-capacity` and the next claim tries
  the wake again, because a fresh spawn would meet the same lack of room.
- **The wake gets no answer.** The attempt moves to `reconciling`, and a respawn from there wakes
  the kept session again, because a lost reply can leave the woken session running and a fresh spawn
  would run beside it.

boxxy forgets a kept session when the item is done or closed, or after a fixed number of hours,
whichever comes first. It never forgets one whose latest attempt is still live.

## Cleanup

atc keeps a stopped session's record until boxxy forgets it, and on an imp target the forget also
destroys the session's imp. Cleanup is the last session step of each tick. It forgets each kept
session that is due, and the session of each settled attempt that isn't kept, on the first tick
after the attempt settles, whatever its outcome. A stray's session is the one exception, as the next
paragraph says. Only the kept session lets a later attempt carry on in the same session, so no other
settled session waits. Cleanup never forgets the session of a live attempt, a sleeping one included,
because the attempt still runs in it. A forget that atc doesn't confirm changes nothing, and cleanup
tries again next tick.

atc refuses to forget a live session, so a stray's session needs a confirmed stop first. A stray is
an attempt that settled while its session may still run
([giving up](./attempts.md#stopping-a-session-and-giving-up)). For its first hours the tick's stray
step sends the stop each tick, and cleanup forgets the session once the stop is confirmed; after
that, cleanup sends the stop itself and forgets in the same pass. boxxy therefore never forgets a
stray's session before it has stopped.

boxxy records each forget on the attempt row as `session-forgotten`, a move of the attempt machine,
and sends no fact, because the fact catalog has no type for cleanup.

## Capacity and the usage limit

atc refuses a session when the worker target has no room, and the atc worker reports that refusal
with the cause `capacity`. The same request would meet the same lack of room on the next tick, so
the runner holds back the pool that the attempt came from for a fixed backoff. During the backoff
the claim starts no item from that pool and wakes none of its sleeping attempts.

- **A spawn refused for capacity fails the attempt** as `no-capacity`, which doesn't count against
  `maxAttempts`, and the item stays ready. Waking a kept session counts as a spawn here. The attempt
  stores atc's answer ([the refusal](./attempts.md#the-refusal-of-a-no-capacity-attempt)).
- **A wake of a sleeping attempt refused for capacity fails nothing.** The attempt sleeps again and
  keeps its wake request.
- **The backoff lives in the runner's memory,** one end time per pool. A restart drops it, and the
  next refusal sets it again.
- **The claim loop claims no item twice in one tick,** so it never resends a refused wake in the
  same tick. An error in the loop ends the loop, and the rest of the tick still runs.

atc reports no usage limit, so nothing detects the account's limit and the next claim spawns into
it. A session at the limit ends by the other
[bounds](./attempts.md#the-bounds-on-a-running-attempt): in agent mode it falls silent and settles
`stalled`, or `timed-out` if the step's time limit comes first, and both count against
`maxAttempts`; in attended mode it sleeps. For a worker kind that does report a reset time, dispatch
settles the attempt as `usage-limit` and backs the pool off until the reset, up to a fixed cap. The
atc worker never reports one.

## The atc worker

`@boxxy/worker-atc` is boxxy's adapter for atc. It calls the atc gateway's MCP tools as atc's
service principal `service:boxxy`, with a token that needs the `read`, `message`, `spawn` and `kill`
scopes. An atc daemon runs the sessions on one machine, and accepts that token only on the targets
listed for `service:boxxy` in its own `principals` key. The client sends the token as a bearer over
streamable HTTP and follows no redirect, so the token goes only to the configured address. It
refuses a tool result that fails its schema or size cap as `malformed_answer`, before boxxy reads
any field.

| boxxy asks to       | atc tools, in order                                       |
| ------------------- | --------------------------------------------------------- |
| start               | `atc_session_spawn`                                       |
| read                | `atc_session_get`                                         |
| suspend             | `atc_session_get`, `atc_session_stop`                     |
| resume              | `atc_session_get`, `atc_session_adopt`, `atc_session_get` |
| stop                | `atc_session_stop`, which keeps the session's record      |
| forget              | `atc_session_forget`                                      |
| wake a kept session | the resume tools, then `atc_message_send`                 |

- **A start is idempotent.** It sends the attempt ID as the idempotency key, so a respawn after a
  lost answer never starts a second session. A read of an attempt whose spawn got no answer first
  finds the session with `atc_sessions_list`, as the latest one with the attempt's spawn name.
- **A suspend skips the stop when the session went back to work** after the time boxxy judged it
  idle.
- **A forget never stops the session first,** and atc refuses to forget a live session. On a target
  that destroys its hosts, atc answers the first call with a confirm token, and the worker's second
  call with it destroys the host.
- **Waking a kept session keys the message by the new attempt's ID.** When atc refuses the message,
  the worker stops the session again, so the fresh spawn that follows doesn't run beside it. When
  that stop fails too, the worker answers `unknown`, and no fresh spawn starts.

### Readings

The worker reads a session's `lifecycle.harness` field from `atc_session_get`: `running` reads as
running, `suspended` as suspended, and `exited` as ended. It never uses atc's top-level state for
this, because atc lists a session as `exited` whenever its process isn't running, so a process
asleep inside its host looks the same as one that ended.

The [bounds](./attempts.md#the-bounds-on-a-running-attempt) read a running session's attention and
last activity to tell when an attended session waits for the owner or an agent-mode session falls
silent.

- **Attention** comes from atc's state: `running` gives `working`, `needs_you` gives `needs-input`,
  and `done` gives `turn-ended`.
- **Last activity** is the later of atc's `lastActivityAt` and `lastAttachedAt`.
- **A suspended reading records whether anyone asked for the sleep:** true unless
  `lifecycle.desired` is `run`, which atc keeps when the host slept by itself.
- **`no_such_session` reads as absent,** except on a spawn. After a daemon restart, atc refuses a
  repeated spawn with that code until it lists the restored session again, so the worker answers
  that spawn as `unknown`.
- **A read with no answer throws,** so a lost connection never settles a running attempt as
  `session-lost`.

### Refusals

atc returns a refused call's code, and sometimes a problem, in `structuredContent`, and the worker
falls back to the `<code>: ` prefix of the text when that part is missing. A refused start or wake
carries the cause `capacity` or `other`.

- **`capacity`** is `host_unavailable` with the problem `ram_budget_exceeded`. atc's imp provider
  puts impd's error code there in lower case, and impd answers `RAM_BUDGET_EXCEEDED` when no budget
  is left for another imp.
- **`other`** is any other atc error code, a malformed result, or a JSON-RPC error that refuses the
  request before it runs (parse error, invalid request, method not found or invalid params), which
  the client codes as `protocol_error`.
- **`unknown`** is a timeout, a dropped connection, an HTTP 5xx, any other JSON-RPC error,
  `outcome_unknown` or `idempotency_key_unknown`, because atc may have run the call.

### Where a session works

The server config's `spawn.repos` gives each repo either a folder on the target or a git source, a
URL and a ref. A target whose machines start empty, such as an imp target, needs a git source.
`item.file` refuses a repo missing from `spawn.repos`, and when a repo leaves the list after its
items were filed, the claim passes over those items.

### Who holds a credential

Some sessions need a credential that others must never hold, such as a review session's clone token.
atc's broker adds the credentials in an agent's broker profile to its session's outbound calls, and
each session runs as the atc agent set in its recipe, the recipe that
[resolves for the item's repo](./pipeline.md#recipes-and-skills). List each agent whose profile
holds a credential in the server config's `spawn.agents`:

```json
{
  "spawn": {
    "agents": {
      "boxxy-review": { "phases": ["review"] },
      "app-live": { "phases": ["live"], "repos": ["example/app"] }
    },
    "phases": { "review": { "requireScopedAgent": true } }
  }
}
```

- Give each entry at least one phase. Each repo in an entry's `repos` must be in `spawn.repos`, and
  an entry with no `repos` lets its agent run in any repo.
- An agent missing from `spawn.agents` may run any phase in any repo, except a phase that sets
  `requireScopedAgent`, as the next bullet says. Keep every credential in a listed agent's profile,
  because boxxy can't read a broker profile.
- `spawn.phases.<phase>.requireScopedAgent` makes every recipe that can run the phase name an agent
  listed for it. [The pipeline](./pipeline.md#recipes-and-skills) lists what the rules loader
  refuses, and the rules repository's check loads a rules pull request with the same scope.
- A spawn request carries the item's `repo` and the attempt's `phase`. Before each spawn, respawn
  and kept-session wake, the worker refuses a request whose agent is listed in `spawn.agents` and
  whose phase or repo is outside the entry, with `agent not scoped`. A config change after the claim
  therefore can't move a credential. A stored request with no `repo` or `phase` reads with the
  attempt's repo and phase.
- The server refuses to start with `spawn.reviewAgents` in its config, and its message shows the
  `spawn.agents` shape.

A session in a folder its agent doesn't trust stops at Claude Code's trust dialog and never runs a
turn. atc has no call that reads which folders an agent trusts, so boxxy keeps the list itself, in
the server config's `atc.trustedFolders` by target, and refuses a folder spawn outside a listed
folder. A spawn from a git source needs no such check: it sends
`workspace: { kind: 'git', url, ref }` with `trustClonedWorkspace: true`, and atc clones the ref,
verifies it and trusts only the clone's root.

The atc daemon clones before the session exists, so the clone gets neither the imp's network nor the
broker's grants. For a private repository, put the name of a daemon environment variable in the git
source's `credentialRef: { name }`, never the token. The daemon reads the token from that variable.
The server refuses to load a config whose git URL holds a credential. Before each git spawn, the
worker refuses a source that pairs a variable name with any URL other than its configured one, with
`git source credential not configured`, so nothing stored on an attempt row can choose which token
is read or where it goes. A respawn sends the stored request again, so after a config change that
drops the pairing the respawn is refused and the attempt settles `spawn-refused`.

### The caller identity

The runner records a caller identity on each attempt row from the worker's answer, and the server
accepts a session's call only from that caller
([the proven caller](../interfaces/api-and-auth.md#the-proven-caller)). The worker reads it from the
session's `host`, which atc reports with the daemon feature `session.host`: the issuer is the host's
`issuer`, and the subject is its `id`, the machine ID that issuer gave it. The worker never uses the
host's `name`. A session with no `host`, or a host missing its `id` or `issuer`, has no caller,
because the proof would refuse it. Every atc session on one machine shares that machine's caller.
