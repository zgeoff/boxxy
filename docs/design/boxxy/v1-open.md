# Open for the builder

No sketch in [`sketches/v1/`](./sketches/v1/) was compiled or run. This doc lists every point that the sketches leave open: what has no design, what is not decided, where the sketches disagree, what nobody checked, what the design assumes, and what must land in another repo first. Settle each point in the slice of the [work list](./v1-work-list.md) that meets it, and rewrite the sketch and the doc in the same commit. In a sketch, search for `Not checked:`, `Assumed:`, `Not decided:`, `TODO (not designed):` and `KNOWN FAULT:` to find the point in its place.

## Not designed

| Point | Where |
| --- | --- |
| A query for the measure "attempts lost". No query reads the failure of an attempt. | [`04-facts.ts`](./sketches/v1/core/04-facts.ts), section D |
| A cause on the `slept` fact. Without one, no report can tell an unattended sleep from an idle sleep. | [`02-queries.ts`](./sketches/v1/pepys-package/02-queries.ts), section D |

## Not decided

- Three points of the [folder layout](./layout-folders.md#open-questions).
- What a build from a git source checks out. The design names no branch or commit per item, so every spawn clones the configured ref. A rework round on the kept session keeps the build's work. A fresh spawn after a failed wake starts again from the ref, and reaches the first build's work only through what that build pushed.
- Whether to make the claim cheaper before the store holds thousands of open items. The built claim holds the lock for 418 ms at p50 with 20,000 open items, and for 2.4 s when every item has a lever ([dispatch](./dispatch.md#the-built-claim-measured)). The expedite signal reads every lever once per item, so its cost grows with the square of the item count. At 5,000 open items the claim's median is 103 to 173 ms, over the store rule's limit of 50 ms, so `rig bench` fails its budget, and CI does not run the claim benchmark until this point is settled.

## Where the sketches disagree

| Point | What stands |
| --- | --- |
| The test fixtures of the package sketch give review sessions the product `codex`. | v1 workers are Claude. The fixture keeps a second product so that the lines per product and the cost per turn stay tested. |

## Lost on a restart

The runner keeps three things in memory only. A restart forgets each one.

- **The capacity backoff of a pool.** The next claim spawns again and finds out again.
- **The usage-limit backoff of a pool**, which can last 24 hours. After a restart boxxy starts sessions against the limit until one fails again.
- **The batch that the outbox sender holds after a retry answer.** The next turn builds a batch from the unsent rows, which can be longer. That is safe because every boxxy fact is on one stream, and pepys drops a copy by its fact ID.

## Not checked

Each row names the test that settles it, where one is known.

### The lifecycle

| Point | The test |
| --- | --- |
| That an owner's attach moves atc's last-attached time for a stopped session, and that atc flags a session as waiting again after an attach while the prompt is still open. The adapter reads `session.lastAttachedAt` and `session.state` (`needs_you`) of `atc_session_get`. | Attach once to a scratch session, then read the session. |
| Whether atc records a trail event during one long tool call. Without one, the quiet rule puts a working attended session to sleep. The adapter reads `lastActivityAt` of `atc_session_get`. | Run one tool call longer than the quiet time. |
| Whether the owner's typing in an attached session moves any atc time: `lastActivityAt` or `session.lastAttachedAt` of `atc_session_get`. | The same attach. |
| Whether an agent-mode session ever ends a turn on purpose before its close-out, such as to wait for a background task. boxxy closes such a session as `closeout-missing`. The adapter reads the turn end from `session.state` `done` of `atc_session_get`. | Watch the first live attempts. |
| That the worker adapter speaks to the real atc gateway at 7.14.0: the `Host` header, the service token and its scopes `read`, `spawn`, `message` and `kill`, the protocol version the client and the gateway agree on, each tool's structured result against the adapter's schemas, and the refusal shape `{ code, problem? }`, with `host_unavailable` and `ram_budget_exceeded` for a host with no memory for another machine. The tests run against an in-process stand-in on atc's MCP server library, with the tool names and result shapes of atc's source. | The live proof: one spawn, read, stop and forget through the gateway. |
| The usage limit is not detected through atc in v1: no agent harness reports that a session hit the account's limit, so atc has nothing to pass on, and the worker adapter's `usageLimitResetsAt` is always null. A session at the limit then ends as a stall or a missing close-out, and the pool backoff never starts. It closes when atc reports the limit and its reset time on the session. | Run one session to the limit, then read it. |
| Whether a rework prompt sent with `atc_message_send` lets the agent push. Claude Code shows a relayed message as one a plug-in sent, and its auto-mode classifier reads only the owner's prompts. | The forced rework round of the live proof. |
| That an attempt's spawn name stays the session's name until the session appears in `atc_sessions_list`. The agent's own `/rename` replaces it. | Spawn, drop the answer, then list. |
| That each folder in the worker adapter's trusted folders exists and is trusted in a fresh machine of its target. The list is the deployment's statement, and a spawn in a configured folder sends the folder alone, with no workspace source and no `trustClonedWorkspace`. | Spawn once in each listed folder on a new machine. |
| That atc's daemon clones a private git source with the token in the environment variable that its `credentialRef` names, and trusts the clone on an imp target, so the first turn runs. | Spawn once from a private git source on a new imp. |
| What `lifecycle.harness` reads between a daemon restart and the fleet restore. If it reads `exited`, the runner settles a running attempt. | Restart the daemon with one session running, then read it before the restore. |

### The API

| Point | The test |
| --- | --- |
| That the CLI's HTTP client works through the broker: `HTTPS_PROXY`, the broker's CA, HTTP/1.1. | One CLI call from an imp. |
| That Claude Code can be given the session MCP endpoint in a session that atc starts. The CLI is the path a prompt names. | Start one session with the endpoint set. |
| That `git fetch` of one commit by ID works from an imp through the broker's proxy and CA, and that the skills repository is public or the broker adds a credential for it. The session-start hook runs this fetch ([the CLI and the hooks](./v1-cli.md#installing-skills)). | Run the hook once in an imp. |
| That the agent's first turn waits for the SessionStart hook, so the fetched skills are in place before the agent lists them, and that the Bash `tool_response` of a PostToolUse payload holds the output as `stdout`. The hooks read both from the Claude Code docs. | Run one session with the plug-in and print the payload. |
| The form of the audience in the broker's identity token: the bare made-up host, or an origin with its scheme. The verifier compares it with the configured audience as an exact string. | Decode one token that the broker adds to a call from an imp. |

### The outbox

| Point | The test |
| --- | --- |
| The 512 bytes that the stored envelope adds to a wire item. It is an allowance. The `id` field takes 56 of them, and a test in `modules/dispatch` checks that over 400 are left; `v` and `api` need the kit's stored form, which the repo does not hold. | Store one fact in the kit's test store and compare the sizes. |
| The size of the largest real fact. A decision fact has no bound of its own, and the sender parks a fact over the limit. | Measure a decision fact with 5,000 open items. |
| That ingest names the bad fact of a refused batch in a stable form. The sender does not rely on it and splits the batch. | None needed. |

### The pepys package

| Point | The test |
| --- | --- |
| Which `Date` functions scriptc refuses to compile. The sketch knows of `Date.now` alone, so the consumer's module calls no `Date` function. | Compile one call of each `Date` function that date arithmetic needs. |
| That a scope consumer can write two entity tables and a link from one scope read. | Run the consumer on the real pepys host. |
| The Rust host, and the scriptc compile in CI. The tests on the kit's test store prove neither. The compile ran once on a dev machine; a fresh install blocks scriptc's install script, so CI does not compile. | The end-to-end test, on a real pepys. |
| That a fact whose payload does not decode is reported. The scope read leaves it out with no error, so a newer boxxy server can lose a fact from a table. | Send one fact with an unknown field value. |
| That a webhook's pull request ID equals the ID that REST returns. [`lookups.md`](./sketches/v1/pepys-package/lookups.md) compared REST with the Events API. | Compare one delivery in pepys with one REST read. |
| That the six statements of the two queries run on the real store. They ran on the kit's test store. | Run both queries on the real store. |
| That a zod schema made in boxxy's copy of zod works as a family type in the kit. The peer dependency is meant to make it one copy. | Build the deployment with the package. |
| That the GitHub plug-in's delivery module gives the release and deploy times that the stage-time query reads. The end-to-end test sends a merge only, so both stay null there. | Send a release and a deploy webhook in the end-to-end test. |
| That the sink contract suite passes against real ingest. It runs against a stand-in; the end-to-end test sends through `createIngest` of `@pepys/ingest`. | Run the suite against `createRealPepys`. |
| That a JSON column compares equal after a round trip, for the sleep stretches. | The shuffle test on the real store. |
| Whether ingest stores a payload as sent or as parsed. If as parsed, a field the deployed package does not know is lost from the log. | Send one fact with an extra field and read the log. |
| That an agent copies the atc session ID onto its telemetry records. atc's doc says so. | Read one exported record. |

## Assumed

- A sleeping host does not count against the 7 worker machines.
- An agent session ID never equals the atc session ID of another session.
- The pepys test store returns rows and links in primary key order.
- Ingest does not check the kind of a fact's actor. boxxy's actors are kinds that no plug-in brings.

## Needs work outside this repo

| What | Where | Needed for |
| --- | --- | --- |
| A broker that signs each call with the identity token. The verifier is `@impz/client` 6.12.0, which `@boxxy/caller-proof-imp` uses. | impz | the proven caller |
| A broker rule for the boxxy host, one trust document per broker host, and the worker token | the cloud repo | the worker path |
| The boxxy CLI and the hook plug-in in the agent image, and `BOXXY_URL` in an atc auth profile | the cloud repo | every session call |
