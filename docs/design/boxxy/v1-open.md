# Open for the builder

No sketch in [`sketches/v1/`](./sketches/v1/) was compiled or run. This doc lists every point that the sketches leave open: what has no design, what is not decided, where the sketches disagree, what nobody checked, what the design assumes, and what must land in another repo first. Settle each point in the slice of the [work list](./v1-work-list.md) that meets it, and rewrite the sketch and the doc in the same commit. In a sketch, search for `Not checked:`, `Assumed:`, `Not decided:`, `TODO (not designed):` and `KNOWN FAULT:` to find the point in its place.

## Not designed

| Point | Where |
| --- | --- |
| How boxxy detects that a session hit the account's usage limit: from the reading, the close-out or telemetry. The answer decides which caller forces the `usage-limit` failure. | [`03-flow.ts`](./sketches/v1/core/03-flow.ts), section F |
| The parts that the core sketch names and does not show: the effect handlers and their plans. `@boxxy/model` holds the rows and ports they read and write. The effect plans have no type yet. | [`02-types.ts`](./sketches/v1/core/02-types.ts) |
| The atc call behind each method of the worker port, and the crash windows of the three steps of a sleep. | [`02-types.ts`](./sketches/v1/core/02-types.ts), [`03-flow.ts`](./sketches/v1/core/03-flow.ts), section C |
| A query for the measure "attempts lost". No query reads the failure of an attempt. | [`04-facts.ts`](./sketches/v1/core/04-facts.ts), section D |
| A cause on the `slept` fact. Without one, no report can tell an unattended sleep from an idle sleep. | [`02-queries.ts`](./sketches/v1/pepys-package/02-queries.ts), section D |

## Not decided

- Which rule wins for an agent-mode session that asks for input and then shows no activity. The idle sleep and the stall rule both fall due at 30 minutes, and the reconcile table gives no order for them.
- Whether a review that settled `unsettleable` starts the merge step of the stage times. In the sketch it does not, so such an item has null merge minutes after its pull request merged.
- The name of boxxy's configuration value that holds the folders of the trust documents. The verifier itself is not open: impz builds it ([`01-api.ts`](./sketches/v1/edge/01-api.ts), section F).
- Three points of the [folder layout](./layout-folders.md#open-questions).

## Where the sketches disagree

| Point | What stands |
| --- | --- |
| The core's tests call `attempt.wake`, and the core's procedure map lists it. | The procedure is `item.wake`, as the API sketch has it. The runner calls the wake request directly. |
| The test fixtures of the package sketch give review sessions the product `codex`. | v1 workers are Claude. The fixture keeps a second product so that the lines per product and the cost per turn stay tested. |

## Known faults in the sketch code

In three places the code of the package sketch does not do what its comment says. Each place has a `KNOWN FAULT:` comment. Build the intended rule.

| Fault | Intended rule |
| --- | --- |
| [`01-package.ts`](./sketches/v1/pepys-package/01-package.ts) declares `caller_issuer` and `caller_subject` on `boxxy_attempt_session`, and both cost joins read them. The upsert writes neither, and `AttemptDraft.sessions` holds neither. No test covers the caller join. | The consumer `boxxy_work` writes both from the `caller` field of the `.started`, `.reconciled` and `.resumed` facts. Without the write the cost query counts nothing. Add the write, and a test: a telemetry row with the attempt's caller counts, and a row with another origin under the same session ID does not. |
| Stage time, in [`02-queries.ts`](./sketches/v1/pepys-package/02-queries.ts): the comment says that the statement filters out a `no-capacity` attempt. The statement has no filter on `failure`. | A `no-capacity` attempt is left out of every measure. |
| Cost, in the same file: the comment says that a `no-capacity` attempt counts in no total. `count(*)` counts it in `attempts`. | A `no-capacity` attempt counts in no total. An attempt that failed with `usage-limit` did run, so its cost and time count. |

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
| That an owner's attach moves atc's last-attached time for a stopped session, and that atc flags a session as waiting again after an attach while the prompt is still open. | Attach once to a scratch session, then read the session. |
| Whether atc records a trail event during one long tool call. Without one, the quiet rule puts a working attended session to sleep. | Run one tool call longer than the quiet time. |
| Whether the owner's typing in an attached session moves any atc time. | The same attach. |
| Whether an agent-mode session ever ends a turn on purpose before its close-out, such as to wait for a background task. boxxy closes such a session as `closeout-missing`. | Watch the first live attempts. |
| Which error atc gives when the worker target has no free machine. The worker adapter must map it to the cause `capacity`. | Fill the target, then spawn. |
| The cost of the position fold inside the claim's lock. | The dispatch benchmark with 20,000 items. |

### The API

| Point | The test |
| --- | --- |
| That the registrar's filter gives each MCP endpoint only its own tools. | List the tools of both endpoints. |
| That a custom error code in the status map changes nothing on the MCP side. | Call a tool that throws one. |
| That an input of unknown type, a custom output and a discriminated union each give a usable MCP tool schema. | List the tools and read the schemas. |
| That the CLI's HTTP client works through the broker: `HTTPS_PROXY`, the broker's CA, HTTP/1.1. | One CLI call from an imp. |
| That Claude Code can be given the session MCP endpoint in a session that atc starts. The CLI is the path a prompt names. | Start one session with the endpoint set. |

### The outbox

| Point | The test |
| --- | --- |
| The 512 bytes that the stored envelope adds to a wire item. It is an allowance. The `id` field takes 56 of them, and a test in `modules/dispatch` checks that over 400 are left; `v` and `api` need the kit's stored form, which the repo does not hold. | Store one fact in the kit's test store and compare the sizes. |
| The size of the largest real fact. A decision fact has no bound of its own, and the sender parks a fact over the limit. | Measure a decision fact with 5,000 open items. |
| That ingest names the bad fact of a refused batch in a stable form. The sender does not rely on it and splits the batch. | None needed. |

### The pepys package

| Point | The test |
| --- | --- |
| That the glue generator types the catalog's nested payloads, and that scriptc compiles the decoder for 27 types. It ran for flat payloads. | Build the package with the pepys CLI. |
| The tie rule for two pull request facts with one time. It ran for the session rule only. | The test of equal times, for a pull request. |
| Which `Date` functions scriptc refuses to compile. The sketch knows of `Date.now` alone, so the consumer's module calls no `Date` function. | Compile one call of each `Date` function that date arithmetic needs. |
| That a scope consumer can write two entity tables and a link from one scope read. | Run the consumer on the real pepys host. |
| The scriptc compile of the entry file and the Rust host. The tests on the kit's test store prove neither. | The end-to-end test, on a real pepys. |
| That the field `designMode` is typed in the glue. It is only when the model's schema names it as a key of an object. | Read the generated glue. |
| That a fact whose payload does not decode is reported. The scope read leaves it out with no error, so a newer boxxy server can lose a fact from a table. | Send one fact with an unknown field value. |
| That a webhook's pull request ID equals the ID that REST returns. [`lookups.md`](./sketches/v1/pepys-package/lookups.md) compared REST with the Events API. | Compare one delivery in pepys with one REST read. |
| That the store has `julianday`, window functions and a common table expression over attached files. | Run the cost query on the real store. |
| That the delivery module of the GitHub plug-in accepts two more joins. | Run the stage-time query. |
| That a zod schema made in boxxy's copy of zod works as a family type in the kit. The peer dependency is meant to make it one copy. | Build the deployment with the package. |
| That a JSON column compares equal after a round trip, for the sleep stretches. | The shuffle test on the real store. |
| Whether ingest stores a payload as sent or as parsed. If as parsed, a field the deployed package does not know is lost from the log. | Send one fact with an extra field and read the log. |
| That an agent copies the atc session ID onto its telemetry records. atc's doc says so. | Read one exported record. |

## Assumed

- A sleeping host does not count against the 7 worker machines.
- An agent session ID never equals the atc session ID of another session.
- The pepys test store returns rows and links in primary key order.
- Ingest does not check the kind of a fact's actor. boxxy's actors are kinds that no plug-in brings.
- The GitHub and telemetry plug-ins export the consumers, the delivery module and the row builders that the package sketch imports.
- The pepys API serves each plug-in query on its RPC route under its snake case name.

## Needs work outside this repo

| What | Where | Needed for |
| --- | --- | --- |
| `@pepys/kit`, with the fact batch sender, the plug-in client type and the definers | pepys | the sink, the reader and the package |
| `@pepys/testing`, with the test store | pepys | the package's tests and the end-to-end test |
| The GitHub and telemetry plug-ins, with the pull request entity ID built from GitHub's own ID, and a proven origin on each telemetry row | pepys | the `produced` link and the cost query |
| The imp identity verifier (`@impz/client/identity`: `verifyImpIdentity`, `checkSessionImp`, `loadIdentityIssuers`), and a broker that signs each call | impz | the proven caller |
| A session that reports its caller identity | atc | the caller on the attempt row |
| A broker rule for the boxxy host, one trust document per broker host, and the worker token | the cloud repo | the worker path |
| The boxxy CLI and the hook plug-in in the agent image, and `BOXXY_URL` in an atc auth profile | the cloud repo | every session call |
