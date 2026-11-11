# Open for the builder

No sketch in [`sketches/v1/`](./sketches/v1/) was compiled or run. This doc lists every point that the sketches leave open: what has no design, what is not decided, where the sketches disagree, what nobody checked, what the design assumes, and what must land in another repo first. Settle each point in the slice of the [work list](./v1-work-list.md) that meets it, and rewrite the sketch and the doc in the same commit. In a sketch, search for `Not checked:`, `Assumed:`, `Not decided:` and `TODO (not designed):` to find the point in its place.

## Not designed

| Point | Where |
| --- | --- |
| How boxxy detects that a session hit the account's usage limit: from the reading, the close-out or telemetry. The answer decides which caller forces the `usage-limit` failure. | [`03-flow.ts`](./sketches/v1/core/03-flow.ts), section F |
| The imp identity verifier: the format of a trust document, the rules for a retired signing key, and the name of the configuration value that holds the trust documents. | [`01-api.ts`](./sketches/v1/edge/01-api.ts), section F |
| The shapes that the core sketch names and does not show: the take SQL of the claim, the sync of the limit seats, `decide` with its snapshot, wake and decision types, the outcome types of the worker port, the spawn request, the effects and their handlers, and the design and build close-outs. Slice 1 code holds an earlier form of several. | [`02-types.ts`](./sketches/v1/core/02-types.ts) |
| The atc call behind each method of the worker port, and the crash windows of the three steps of a sleep. | [`02-types.ts`](./sketches/v1/core/02-types.ts), [`03-flow.ts`](./sketches/v1/core/03-flow.ts), section C |
| Which outbox function lives in `modules/dispatch` and which in `apps/server`. | [folder layout](./layout-folders.md#open-questions) |
| The `turbo boundaries` tag of `packages/pepys`, and the import zones for it. The [layout](./layout.md#dependency-rules) has four tags, and none fits a package that holds a plug-in, an adapter and a reader. | [layout](./layout.md) |
| A query for the measure "attempts lost". No query reads the failure of an attempt. | [`04-facts.ts`](./sketches/v1/core/04-facts.ts), section D |
| A cause on the `slept` fact. Without one, no report can tell an unattended sleep from an idle sleep. | [`02-queries.ts`](./sketches/v1/pepys-package/02-queries.ts), section D |

## Not decided

- Whether the loader refuses a hold reason in the rules file that equals one of the engine's three hold reasons.
- Which rule wins for an agent-mode session that asks for input and then shows no activity. The idle sleep and the stall rule both fall due at 30 minutes, and the reconcile table gives no order for them.
- Whether a review that settled `unsettleable` starts the merge step of the stage times. In the sketch it does not, so such an item has null merge minutes after its pull request merged.
- Whether `runner.pause` breaks the rule that every store change writes an outbox row. The sketch writes the runner row and no fact.
- Four points of the [folder layout](./layout-folders.md#open-questions).

## Where the sketches disagree

| Point | What stands |
| --- | --- |
| The core's tests call `attempt.wake`, and the core's procedure map lists it. | The procedure is `item.wake`, as the API sketch has it. The runner calls the wake request directly. |
| Section D of the fact catalog lists `slept_ms` and another key for `boxxy_attempt_session`. | The columns of the package sketch stand: a list of sleep stretches, and the key of attempt and session. |
| The package sketch declares `caller_issuer` and `caller_subject` on `boxxy_attempt_session`, and the cost query joins on them. The consumer's entry file in the same sketch writes neither column. | The entry file must write both, from the caller on the attempt's session facts. Until it does, the cost query counts no row. |
| No test in the package sketch covers the caller join of `boxxy_cost_to_land`: no fixture sets a telemetry row's origin or an attempt's caller. | Add the test with the entry file fix: a row with the attempt's caller counts, and a row with another origin under the same session ID does not. |
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
| That an owner's attach moves atc's last-attached time for a stopped session, and that atc flags a session as waiting again after an attach while the prompt is still open. | Attach once to a scratch session, then read the session. |
| Whether atc records a trail event during one long tool call. Without one, the quiet rule puts a working attended session to sleep. | Run one tool call longer than the quiet time. |
| Whether the owner's typing in an attached session moves any atc time. | The same attach. |
| Whether an agent-mode session ever ends a turn on purpose before its close-out, such as to wait for a background task. boxxy closes such a session as `closeout-missing`. | Watch the first live attempts. |
| Which error atc gives when the worker target has no free machine. The worker adapter must map it to the cause `capacity`. | Fill the target, then spawn. |
| That the generic on the phase definer gives a compile error for an outcome the phase kind does not list. | Compile one phase file with a wrong outcome. |
| The XState machine under tsgo, and the race guard of a store change with the machine. | The machine's tests in the build. |
| The cost of the position fold inside the claim's lock. | The dispatch benchmark with 20,000 items. |

### The API

| Point | The test |
| --- | --- |
| That the registrar's filter gives each MCP endpoint only its own tools. | List the tools of both endpoints. |
| That a custom error code in the status map changes nothing on the MCP side. | Call a tool that throws one. |
| That an input of unknown type, a custom output and a discriminated union each give a usable MCP tool schema. | List the tools and read the schemas. |
| A zod transform in an MCP input schema. The contract uses none. | None needed while the rule holds. |
| That the CLI's HTTP client works through the broker: `HTTPS_PROXY`, the broker's CA, HTTP/1.1. | One CLI call from an imp. |
| That Claude Code can be given the session MCP endpoint in a session that atc starts. The CLI is the path a prompt names. | Start one session with the endpoint set. |

### The outbox

| Point | The test |
| --- | --- |
| The 512 bytes that the stored envelope adds to a wire item. It is an allowance. | Store one fact and compare the sizes. |
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
- Every catalog payload is a zod object, so the wire schema can extend it with the store version.
- The GitHub and telemetry plug-ins export the consumers, the delivery module and the row builders that the package sketch imports.
- The pepys API serves each plug-in query on its RPC route under its snake case name.
- `@boxxy/model` exports a zod schema for each core row.

## Needs work outside this repo

| What | Where | Needed for |
| --- | --- | --- |
| `@pepys/kit`, with the fact batch sender, the plug-in client type and the definers | pepys | the sink, the reader and the package |
| `@pepys/testing`, with the test store | pepys | the package's tests and the end-to-end test |
| The GitHub and telemetry plug-ins, with the pull request entity ID built from GitHub's own ID, and a proven origin on each telemetry row | pepys | the `produced` link and the cost query |
| The imp identity verifier, and a broker that signs each call | impz | the proven caller |
| A session that reports its caller identity | atc | the caller on the attempt row |
| A broker rule for the boxxy host, one trust document per broker host, and the worker token | the cloud repo | the worker path |
| The boxxy CLI and the hook plug-in in the agent image, and `BOXXY_URL` in an atc auth profile | the cloud repo | every session call |
