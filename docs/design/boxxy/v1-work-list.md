# v1 work list

Build [v1](./v1.md) in the 23 slices below, in order: slices 1 to 22, and slice 20a between 20 and 21. Each slice names its outcome, the sketch files it follows, what it needs first, and the check that proves it. Slices 1 to 14 need nothing outside this repo. Slices 15 to 19 each need a package or a change from another repo. Slices 20 to 22 prove the whole system: an end-to-end test in CI, the npm release that the deploy installs, the deploy, and one item through the deployed system. Before a slice, read its points in [open for the builder](./v1-open.md).

Every slice passes `bun run typecheck`, `bun run lint` and `bun run test`, and puts its code where the [folder layout](./layout-folders.md) says. The sketches are in [`sketches/v1/`](./sketches/v1/): `core/`, `edge/` and `pepys-package/`.

## Inside this repo

### 1. Workspace

- **Outcome:** the workspace, the lint zones and the dead-code check list `packages/*`, and `@faker-js/faker` is a dev dependency of `@boxxy/model`, so that the pepys deployment does not install it through `@boxxy/pepys`.
- **Follows:** [layout](./layout.md), "Workspace".
- **Needs:** nothing.
- **Check:** the three local checks and `bun run boundaries` pass, and `bun install` in a package that depends on `@boxxy/model` installs no faker.

### 2. The model

- **Outcome:** `@boxxy/model` holds the v1 rows, IDs, ports, close-out types and report schemas. The fact ID brand is a bare UUID version 7, and the names `link` and `pr` are `relation` and `pull_request`.
- **Follows:** `core/02-types.ts`; `core/04-facts.ts`, sections A to C; `pepys-package/02-queries.ts`, section B.
- **Needs:** slice 1.
- **Check:** one schema per fact type, 27 in all, each checked against its payload type; a test parses one valid and one invalid payload of each.

### 3. The rules loader

- **Outcome:** the loader reads pipelines with steps and edges, limits, pools with no slot count, the three sleep times, the skills pin and the relation types, and refuses a file for each v1 rejection reason.
- **Follows:** `core/01-usage.ts`, part 1; `core/02-types.ts`, the registries section.
- **Needs:** slice 2.
- **Check:** the example rules file loads, and one test per rejection reason loads a file that the loader refuses with that reason.

### 4. The engine

- **Outcome:** the pure step and fold of the pipeline, the derived item state that reads the position, and the rules dry run.
- **Follows:** `core/03-flow.ts`, sections E and G; `core/02-types.ts`, the engine section.
- **Needs:** slices 2 and 3.
- **Check:** the three position tests of `core/01-usage.ts`, part 6, and one test per row of the rules-change table.

### 5. Phase kinds and close-outs

- **Outcome:** the four phase kinds, each with its outcome list, its input, its close-out parser and its settle rule; the size limits of a close-out; the summary of the review tool's result.
- **Follows:** `core/01-usage.ts`, part 2; `core/02-types.ts`, the close-outs section.
- **Needs:** slices 2 and 3.
- **Check:** a parser test per phase with a valid body, a body with two problems that both come back, and a triage body with no acceptance list; the test that holds the relation between the size limits.

### 6. The store

- **Outcome:** migrations for limit seats in place of pool slots, the attempt columns, notes, notices, relations, the kept session, the outbox columns and their two indexes, and GitHub's ID on a pull request; the reads that the core sketch lists; the memory store with the same behaviour.
- **Follows:** `core/02-types.ts`, the rows and `StoreReader`; `edge/02-outbox.ts`, section B.
- **Needs:** slice 2.
- **Check:** the store contract suite passes against the SQLite store and the memory store, with new cases for seats taken all or none, the caller lookup and the outbox reads.

### 7. Planning with limits

- **Outcome:** `decide` gives a start pick or a wake pick only when every limit that counts it has a free seat, puts a wake first, and gives no pick in a pool that is in backoff. The pool concept has the design mode filter.
- **Follows:** `core/02-types.ts`, the planning section; `core/03-flow.ts`, section F.
- **Needs:** slices 2 and 3.
- **Check:** tests for a full limit, a wake before a start, an item with no design mode, and a pool in backoff.

### 8. The attempt machine

- **Outcome:** the XState machine of the attempt states, the one builder of every attempt write, and the import pin that lets only `modules/dispatch` import `xstate`.
- **Follows:** `core/03-flow.ts`, section A.
- **Needs:** slice 2.
- **Check:** generated paths reach all 8 states; one test per row of the table of moves; a test fails when another file of the package writes to the attempts table.

### 9. Dispatch

- **Outcome:** the claim, the start and the wake of a claim, the reconcile table, the sleep, the close-out with its caller check, settle, and the end of an item's attempts; the fake worker and the worker contract suite.
- **Follows:** `core/03-flow.ts`, sections B, C, D and F; `core/01-usage.ts`, parts 3 and 6.
- **Needs:** slices 4 to 8.
- **Check:** every dispatch test of `core/01-usage.ts`, part 6, on the memory store and the fake worker; one test per cell of the reconcile table.

### 10. Kept session, cleanup and notices

- **Outcome:** the rework of a build wakes the kept session; the tick forgets the sessions of settled attempts; a settle that leaves a hold writes a notice row, and the tick sends it through the notifier port.
- **Follows:** `core/03-flow.ts`, section H; `core/02-types.ts`, the notice port.
- **Needs:** slice 9.
- **Check:** the kept session tests of `core/01-usage.ts`; tests for the fallback spawn, the forget after 24 hours, and a failed notice that changes no attempt.

### 11. The outbox sender

- **Outcome:** the batch rule, the sender loop with its answers, parking, the status, the fake sink and the sink contract suite.
- **Follows:** `edge/02-outbox.ts`, sections B to E.
- **Needs:** slice 6.
- **Check:** one test per row of the table of answers; the retry test sends the same rows twice; the test of a day with the sink down.

### 12. The contract

- **Outcome:** the package `@boxxy/contract` with the 26 procedures and the access table.
- **Follows:** `edge/01-api.ts`, sections B to D.
- **Needs:** slice 2.
- **Check:** the test that walks the contract against the access table.

### 13. The server

- **Outcome:** the handlers, the root middleware with the scope of the worker token and the `CallerProof` port with its fake and its refuse-all adapter, the three doors, the runner tick and the capacity backoff.
- **Follows:** `edge/01-api.ts`, sections A, E and F; `core/01-usage.ts`, part 3.
- **Needs:** slices 9 to 12.
- **Check:** the three auth tests of `edge/01-api.ts`, section D, against the RPC route and both MCP endpoints; the worker token gets `FORBIDDEN` on every owner procedure.

### 14. The CLI and the hooks

- **Outcome:** one command per procedure; the close-out command that reads its attempt first; the session-start hook that fetches the pinned skills and then binds; the hook that links a pull request.
- **Follows:** `core/01-usage.ts`, parts 4 and 5; `edge/01-api.ts`, section D.
- **Needs:** slices 12 and 13.
- **Check:** each command against a server on the memory store; the hook test with a missing skill settles the attempt as `skill-missing`.

## With other repos

### 15. The atc worker adapter

- **Outcome:** the worker port on atc: start, read, suspend, resume, stop, forget and wake a kept session; the check of the trusted folder; the caller identity of each session.
- **Follows:** `core/02-types.ts`, the worker port.
- **Needs:** slice 9. atc reports a session's VM host from release 7.13.0.
- **Check:** the worker contract suite against the adapter and the fake.

### 16. The GitHub adapter and the pull request watch

- **Outcome:** the forge port on GitHub with GitHub's own ID of a pull request, and the watch that links what the hook missed and records merges.
- **Follows:** `core/04-facts.ts`, section D, "the `produced` link".
- **Needs:** slices 9 and 13.
- **Check:** a hook call with the forge down writes nothing, and the watch then links the pull request.

### 17. The atc notifier

- **Outcome:** a hold notice arrives as an atc message in one named session.
- **Follows:** `core/02-types.ts`, the notice port.
- **Needs:** slice 10.
- **Check:** the adapter's test against a fake atc client.

### 18. The pepys package

- **Outcome:** `@boxxy/pepys` with the source, the sink, the `boxxy_work` consumer that writes the caller columns, the two queries and the reader; the lint rule that keeps `@boxxy/pepys` out of every module and out of `@boxxy/model`.
- **Follows:** every file of `pepys-package/`; `edge/02-outbox.ts`, sections C and F.
- **Needs:** slices 2 and 11, and from pepys: `@pepys/kit`, `@pepys/testing`, and the GitHub and telemetry plug-ins.
- **Check:** the tests of `pepys-package/04-test.ts`, a test of the caller join, the sink and reader contract suites, and the glue check.

### 19. The imp identity adapter

- **Outcome:** the `CallerProof` adapter that verifies the broker's identity token.
- **Follows:** `edge/01-api.ts`, section F.
- **Needs:** slice 13, and the imp identity verifier from impz.
- **Check:** tests for a valid token, a wrong audience, an expired token and an issuer that is not configured.

## Proof

### 20. The end-to-end test in CI

- **Outcome:** one test takes an item through triage, design, build, review, one rework round and a merge.
- **Follows:** every sketch.
- **Needs:** slices 1 to 19, and a pepys that the test can start: ingest, the store and the API, with the GitHub, telemetry and boxxy plug-ins.
- **Check:** the test runs in CI with scripted sessions on the fake worker and a signed fake webhook for the merge. The facts go into a real pepys through its ingest route. The item ends `done`, and both queries return the expected rows from that pepys.
- **Built:** the item-to-merge journey test in `apps/cli/src/commands/report-commands.test.ts` runs in `bun run test`. The real server runs on the SQLite store, and the real CLI and hooks run each session. The outbox sender sends every fact through `createPepysFactSink`. The reports reach the pepys under test through the CLI, the server and `createPepysReader`. In CI, the pepys under test is `createRealPepys` in `@boxxy/pepys/test-utils`: the real `@pepys/ingest` and `@pepys/api` from npm, in process, with the real GitHub, telemetry and boxxy plug-ins. Ingest checks each signature, the sender and each fact, and appends to its fact log. Before each query, `applyFactLog` of `@pepys/testing` applies the new log entries to the store, so the path from the log to the store is pepys code. Three parts stand in for a deployment's: the sender proof is the fake one of `@pepys/ingest`, the fact log is ingest's memory log, and the store is the kit's test store. The signed webhook and the OTLP telemetry records go through ingest's own GitHub and telemetry routes. The journey so proves three points: the GitHub plug-in's `githubDelivery`, passed as the plug-in exports it, gives the stage-time query the merge; the real GitHub and telemetry consumers have the columns that the queries' consumer types name, because the type check passes them to the boxxy plug-in; and the API serves both queries on its RPC route under their snake case names. The journey reaches pepys only through `startPepysUnderTest` in `apps/server/src/test-utils/`. The Rust host, its store and scriptc stay out of the test: [open points](./v1-open.md#the-pepys-package).

### 20a. The npm release

- **Outcome:** every package that the deployment installs is on npm with a trusted publisher, and one release publishes them all from CI at one shared version, with provenance: `@boxxy/server`, `@boxxy/pepys`, the CLI, and each package they depend on.
- **Follows:** [How boxxy ships](./release.md); the [releasing runbook](../../runbooks/releasing.md).
- **Needs:** slices 13 to 19 on `main`, each package in the `linked-versions` group, and each new name published once as a placeholder by a maintainer.
- **Check:** `npm view @boxxy/<folder>@<version>` prints the release's version for every package, each version shows a provenance badge on npm, and `npm audit signatures` passes in an empty project that installs `@boxxy/server` and `@boxxy/pepys`.

### 21. The deploy

- **Outcome:** the boxxy server runs in the deployment of the cloud repo, with the worker token, the trust documents, the pepys plug-in in the pepys deployment, and the CLI and hook plug-in in the agent image.
- **Follows:** [API and auth](./v1-api-and-auth.md), "The paths".
- **Needs:** slices 20 and 20a, and the deployed pepys.
- **Check:** `boxxy status` from the owner's path answers, and the outbox state is `idle`.
- **Built:** the cloud repo's deployment runs the server image with the rules and prompts, the worker token and the trust documents. The pepys deployment runs `@boxxy/pepys` 0.2.0 on pepys 0.2.0, and the agent image carries the CLI and its hooks. `boxxy status` from the owner's path answers with no live attempt, and the outbox is `idle` with nothing unsent.

### 22. The live proof

- **Outcome:** one throwaway item goes through the deployed system: a real worker opens a pull request in a scratch repo, the review runs, the pull request merges, and the item is `done`.
- **Follows:** nothing new.
- **Needs:** slice 21.
- **Check:** all of these hold:
  - `report.cost` shows a cost above zero, and `report.stageTimes` shows minutes for all 4 phases;
  - the worker token gets `FORBIDDEN` on an owner procedure;
  - one forced rework round runs on the kept session;
  - no session and no worker machine is left after the item settles;
  - a replayed webhook changes nothing.
- **Built:** one throwaway item in a private scratch repo went through triage, design, build, review, a second build round and a second review, and its pull request merged. Each check held:
  - `report.cost` showed model requests in every phase and a cost above zero, and `report.stageTimes` showed minutes for triage, design, build, review and merge;
  - the worker token got `FORBIDDEN` on an owner procedure, and a call with no token got 401;
  - the review asked for changes, and the second build round ran on the first build's kept session;
  - after the item settled, `boxxy status` showed no attempt and no stray, and no worker machine was left for the run's sessions. A failed session other than a review's stays for the 24 hours that the [cleanup rule](./v1-lifecycle.md#cleanup) sets;
  - a redelivered `pull_request` webhook left the pull request's row and both reports unchanged, because pepys applies each fact ID once.
- **Faults the proof found:** the atc daemon's path had no `tar`; the deployed prompts did not tell a session how to close out, which the session start guide now does; and the cost query matched no telemetry for a session on a remote target, because telemetry carries the session's own ID, the part after the last dot.
