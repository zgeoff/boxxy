# Next work list

Build three designs in slices 1 to 14 below, in order: [review, verify and merge](./review-and-merge.md), [wringer journeys](./wringer-journeys.md) and [owner notices](./owner-notices.md). Slice 15 renders the [launch prompt](./v1.md#the-launch-prompt) with Liquid. Slice 16 adds [held items](./planning.md#held-items). Slice 17 sends a failed verify's features to the rework build. Each slice gives its outcome, the doc and sketch files it follows, what it needs first, and the check that proves it. Slices 1 to 12 need nothing outside this repo except wringer 0.2.0. Slices 13 and 14 change the cloud repo's deployment.

Every slice passes `bun run typecheck`, `bun run lint` and `bun run test`, and puts its code in the folders that the [folder layout](./layout-folders.md) sets. The sketches are in [`sketches/next/`](./sketches/next/): `review-and-merge/` and `wringer-journeys/`. The owner-notices sketches sit inside its doc.

## Review, verify and merge

### 1. The model and the ports

- **Outcome:** `@boxxy/model` holds `ReviewGate`, `Verifier`, `JobWorker`, `WorkerRegistry`, the merge types and the new close-outs. The catalog holds 30 fact types, with `boxxy.attempt.job_started`, `boxxy.merge.requested` and `boxxy.merge.answered`. The rules loader refuses a file for each of the reasons unknown-worker, merge-without-rules, empty-merge-checks and builder-session-not-kept.
- **Follows:** [review and merge](./review-and-merge.md); `review-and-merge/02-types.ts`.
- **Needs:** nothing.
- **Check:** one loader test per new refusal reason, and the catalog test counts 30 fact types.

### 2. Job attempts in dispatch

- **Outcome:** the tick runs job attempts: an attempt moves from starting to running on its first read, and the moves acted, answered and waited are recorded. The settings `jobReadSeconds` and `actRetryMinutes` and the `jobs` limit apply.
- **Follows:** [review and merge](./review-and-merge.md#job-attempts); `review-and-merge/03-flow.ts`.
- **Needs:** slice 1.
- **Check:** one test per job attempt transition, and a test that a refused lease sends no call.
- **Built:** the claim stores the phase kind's worker on the attempt, and the tick routes each live attempt through the server's worker registry. `runJobReading` in `@boxxy/dispatch` moves a job attempt to running on its first read, records the moves waited, acted and answered, and settles the attempt in the same tick when its drive finishes. The acted mark and `boxxy.merge.requested` go in one change under the lease. Store migration 0006 adds the job columns to the attempt row. The `run-job-reading` tests cover each transition and a refused mark that sends no call.

### 3. The review phase

- **Outcome:** `createReviewPhase`, `buildRoundCause`, the `review-run` recipe, and the close-out procedure that runs `accept` with the hash of the raw body. `adapters/review-noslop` builds the command: a full review first, then `--fixes-only` with the plain review when it judged no fix. It accepts the result through `sendResult` and `check`. Each review after the first records `unrelatedLines`, from the forge's `readChangedFiles` and the pure `countUnrelatedLines`. The v1 `ReviewCloseOut` and `NoslopSummary` are gone, and the v1 sketch lines that named them are rewritten.
- **Follows:** [the review gate](./review-and-merge.md#the-review-gate); `review-and-merge/01-usage.ts`.
- **Needs:** slice 1.
- **Check:** the adapter tests in the doc's acceptance table, `countUnrelatedLines` test rows and a close-out procedure test with a fake forge compare, the system test of a restart between the post and the store, and a test that refuses a close-out from another session.

### 4. The verify phase

- **Outcome:** the verify phase kind, the recipe field `session: builder|fresh`, the kept-session rule for verify, and `resumeFallback` on a fallback to a fresh session.
- **Follows:** [the verifier](./review-and-merge.md#the-verifier).
- **Needs:** slice 1.
- **Check:** the kept-session tests, and the loader refusal builder-session-not-kept.
- **Built:** `verify` in `@boxxy/closeout` is in `phaseKinds`. Its input holds the pull request, the head that the latest passed review read and the recipe's `session`, and its parser copies `session` from that input into the close-out. A `verified` or `failed` verify succeeds, so a `session: builder` grader keeps its session for the rework, and a `blocked` or `abandoned` one fails. The verify close-out gains the result `abandoned`. `pickKeptSession` in `@boxxy/dispatch` wakes the kept session for a `session: builder` recipe as for a `resume: true` edge, and a claim that wants a kept session and finds none starts fresh with `resumeFallback: true`. `buildKeepWrites` keeps a build's session when its kind has a `session: builder` recipe, and keeps the grader's session again. The example rules hold no verify step. The `build-keep-writes`, `resume-kept-session`, `pick-kept-session` and `verify` tests cover the rule, and slice 1's loader test covers builder-session-not-kept.

## Wringer journeys

### 5. The verify CLI and the harness

- **Outcome:** `bun verify` with the registry, the harness, `runBoxxy` and the map from paths to features, all in `system-tests/src/test-utils/verify/`, and `makeBrokerSend` in `@boxxy/system-tests/test-utils`. The verify and wringer skills, `.wringer/` in `.gitignore`, the import-zones entry for wringer, the layout row, and the grading steps in AGENTS.md.
- **Follows:** [wringer journeys](./wringer-journeys.md); `wringer-journeys/01-usage.ts` and `02-types.ts`.
- **Needs:** wringer 0.2.0.
- **Check:** a fresh agent with only the verify skill reaches `done` on all three journeys. The journeys pass in a network namespace with only loopback up. `bun verify lint` and `bun run check:test-layout` pass, and a test fails on a tracked path that the map neither maps nor ignores.
- **Built:** `bun verify` runs `system-tests/src/test-utils/verify/verify.ts` on wringer 0.2.0, with the registry in `verify-registry.ts`, the harness in `harness/`, `runBoxxy` and the map in `feature-paths.ts`. The journeys `file-item`, `claim-settle` and `report-cost` drive the CLI and the server through the harness. `makeBrokerSend` moved out of `create-test-cli` into its own module. The verify and wringer skills sit in `.claude/skills/`, `.gitignore` holds `.wringer/`, the import-zones `wringer` rule and the layout row pin wringer to `system-tests`, and AGENTS.md holds the grading steps. The `journey-verify-harness` system test runs the three journeys on one harness in any order, and the `feature-paths` test fails on a tracked path that the map neither maps nor ignores.

### 6. The CI gate

- **Outcome:** `.github/workflows/verify.yml` runs the `verify / gate` check, with the `ci:verify-gate` script and its annotations, and the `verify:lint` script.
- **Follows:** [wringer journeys](./wringer-journeys.md); `wringer-journeys/03-flow.ts`.
- **Needs:** slice 5.
- **Check:** a pull request that changes a mapped path fails with no report and passes with one. A pull request that changes only a README passes, and so does one that changes only the lock file.
- **Built:** `.github/workflows/verify.yml` runs the `verify / gate` job on each pull request event of the types `opened`, `synchronize`, `reopened` and `edited`. The job runs `verify:lint`, then `ci:verify-gate`. `scripts/ci/run-verify-gate.ts` writes the body from the event to a file, runs `bun verify gate` against `origin/<base>`, and prints one `::error::` annotation per failing feature and per unmapped path. The `run-verify-gate` tests run the script on fixture git repos with boxxy's real map. A mapped change fails with no report, passes with a verdict of each feature at the fingerprint, and fails with verdicts at an older one. A README-only change passes, and so does a lock-file-only change, while an unmapped path fails.

### 7. The Verifier adapter

- **Outcome:** `adapters/verifier-wringer` fills `VerifyReading` through `readAt`, from the gate run and the report in the pull request body.
- **Follows:** [the verifier](./review-and-merge.md#the-verifier).
- **Needs:** slices 1 and 6.
- **Check:** adapter tests for `verified`, `incomplete` and `not-covered`.
- **Built:** `createWringerVerifier({ forge, gateCheck })` in `@boxxy/verifier-wringer` reads the gate check at the head first, and counts only a check run, never a commit status of that name. A run that passed reads `verified` and a run that failed reads `incomplete`, each with the features of the report that `parseReportBlock` from `@wringer/core` finds in the body. A passed or failed run with no report that parses reads `incomplete` with no features. No run, a pending run, or a run that ended `other`, such as `cancelled`, reads `not-covered`, and the body is never read. The forge port gains `readPullRequestBody` and `readChecks`. `@boxxy/forge-github` reads the newest check run of each name and every page of the commit statuses at a head, and marks each name's source, and the fake forge seeds a body and the checks. The `wringer-core` import-zones rule lets the adapter import `@wringer/core`. The `forge-github` tests of the two reads run against MSW handlers on `@msw/data` collections. The test preload in `bunfig.toml` starts the one mock network of each test process, from `adapters/forge-github/src/test-utils/`. The `create-wringer-verifier` tests cover each reading, and `collect-check-states` covers each check state. The server builds the verifier for the merge job ([slice 8](#8-the-forge-merge-and-the-merge-phase)).

## The merge step

### 8. The forge merge and the merge phase

- **Outcome:** `adapters/forge-github` reads the required checks and the mergeable state, and merges at a head with `mergeAtHead`. Slice 7 added `readChecks`. `decideMerge` in `modules/train` decides each merge read, the merge phase runs it, and the `record-merge` effect is guarded by the pull request row's state.
- **Follows:** [the merge step](./review-and-merge.md#the-merge-step); `review-and-merge/03-flow.ts`.
- **Needs:** slices 2 and 7.
- **Check:** one `decideMerge` test per row of the merge table, forge tests on recorded GitHub answers, and the merge journey in `system-tests/e2e/`.
- **Built, the forge:** the forge port gains `readRequiredChecks`, `readMergeable` and `mergeAtHead`, and `MergeableState` names the three mergeable states. `@boxxy/forge-github` reads a branch's required checks as the union of its rulesets' `required_status_checks` rules and its classic protection's checks, skips classic checks whose enforcement is `off`, and throws for a missing branch, a rule it cannot parse, or more than 300 rules. `mergeAtHead` sends one `PUT .../merge` with `sha: head` and the method, answers `head-moved` to a 409 and `not-mergeable` with GitHub's message to a 405, and throws for any other status or for a 200 that does not say `merged: true`. The fake forge seeds the required checks and the mergeable state, merges only an open, clean pull request at its last commit, and reads a pull request that is no longer open as `unknown`, as GitHub does. The forge contract covers the three calls, and the adapter runs it against the MSW handlers, which answer every route the adapter calls. The adapter's tests read recorded answers from `src/test-utils/fixtures/`. The server's forge calls GitHub as the boxxy App, with an installation token that `createGithubAppAuth` mints from `BOXXY_GITHUB_APP_CLIENT_ID`, `BOXXY_GITHUB_APP_PRIVATE_KEY` and `BOXXY_GITHUB_APP_INSTALLATION_ID` ([the GitHub adapter](./v1-lifecycle.md#the-github-adapter)). `readPullRequest` reads the pull request's base branch, which the merge phase passes to `readRequiredChecks`. The fake forge gives `main` as the base of a pull request seeded with none.
- **Built, the merge:**
  - The merge job, `createMergeJob` in `@boxxy/dispatch`, reads the pull request, its mergeable state, the checks at its head, the required checks of its base branch, the verify reading and the item's latest review. It merges through `mergeAtHead`.
  - `decideMerge` in `@boxxy/train` checks the rows of the [merge table](./review-and-merge.md#the-merge-step) from the top, against what the merge job read. It finishes the attempt, waits, or asks the forge to merge at the head that the job read. Its close-out sets every field of `MergeCloseOut`, because the close-out schema refuses a missing field.
  - The `merge` phase kind in `@boxxy/closeout` is in `phaseKinds`, and its attempts run on the job worker `merge.forge`. Its input is the item's latest pull request. Its drive parses the job's reading with `mergeObservationSchema`, takes the last merge call that boxxy marked on the attempt row, and calls `decideMerge`. A settle with the outcome `merged` asks for the `record-merge` effect.
  - The `record-merge` handler in `@boxxy/dispatch` skips a pull request row that is not open. The settle and the [pull request watch](./v1-lifecycle.md#the-pull-request-watch) each skip a row that the other moved to merged, so the store holds one `boxxy.pull_request.merged` fact for each merge.
  - With a `github` section, the server builds the verifier with `createWringerVerifier` on the `verify / gate` check, and the merge job on that verifier. Without one, it builds neither, and the loader refuses rules with a merge step.
  - The `decide-merge` tests hold a case for each row of the merge table. The `create-merge-job`, `merge` and `start-server` tests cover the job, the phase kind and the server's wiring, and the `journey-merge-at-head` system test merges a reviewed pull request through the server tick.

### 9. Stage time for the merge step

- **Outcome:** the pepys stage-time query starts the merge step at the claim of the first merge attempt after the latest passed review. A pepys query sums each item's `unrelatedLines` across its later reviews, so pepys shows unrelated change that reached a `--fixes-only` review.
- **Follows:** [facts and pepys](./review-and-merge.md#facts-and-pepys).
- **Needs:** slices 3 and 8.
- **Check:** a stage-time query test, and a query test that reads `unrelatedLines` from two review close-outs.
- **Built:** `buildStageTime` in `@boxxy/pepys` starts the merge step at the claim of the first `merge` attempt claimed at or after the latest end of a passed review, a live attempt too, and at that review's end when no such attempt exists. The `boxxy_work` consumer gains the `unrelated_lines` column on `boxxy_attempt`, which the fold copies from a review close-out's `unrelatedLines`, and the package's glue is regenerated. `stageTimeSchema` in `@boxxy/model` gains `rework.unrelatedLines`, the sum over the item's reviews, null when no review recorded one. A boxxy server with this reader refuses the answer of an older `@boxxy/pepys`, so the pepys deployment takes the new package first. The `build-stage-time` tests cover the merge start, its fallback and the sum, the `build-stage-time-query` test reads two review close-outs and a merge claim from applied facts, and the item-to-merge system test reads the sum through the CLI. No pepys query reads `resumeFallback`: [the verifier](./review-and-merge.md#the-verifier) names the grader comparison and specifies no query for it.

### 10. The merge-and-hold journey

- **Outcome:** one item goes through build, review, verify and merge with a fake forge. A red check sends it to repair, and the fourth repair holds it.
- **Follows:** [acceptance](./review-and-merge.md#acceptance).
- **Needs:** slices 3, 4, 7 and 8.
- **Check:** `bun run test:system`.

## Owner notices

### 11. Notices survive sleep and restart

- **Outcome:** each notice row stores `keySeq`, `keyTries` and `nextTryAt`. `sendNotices` retries with no cap, waiting 5 seconds and doubling up to 15 minutes, and `listNoticesDue(now, limit)` replaces `listNoticesToSend(maxTries, limit)`. The atc notifier keeps no state and maps each atc code to sent, refused or uncertain. `runner.status` shows `oldestUnsentAt` and `lastError`.
- **Follows:** [owner notices](./owner-notices.md).
- **Needs:** nothing.
- **Check:** the `sendNotices` and notifier tests in the doc's acceptance section.
- **Built:** store migration 0004 adds `keySeq`, `keyTries` and `nextTryAt` to the notice row, and both claim stores read due rows through `listNoticesDue`. `sendNotices` in `@boxxy/dispatch` retries with the backoff above, and the atc notifier keeps no state. `runner.status` returns `oldestUnsentAt` as a timestamp string, beside `lastError`. The `send-notices`, `create-atc-notifier` and `runner-handlers` tests cover the backoff, the code map and the status fields.

### 12. The notice session by ID, with its own token

- **Outcome:** the server reads the notice session's ID from `BOXXY_ATC_NOTICE_SESSION` and the notice token from `BOXXY_ATC_NOTICE_TOKEN`, and the config key `noticeSession` goes. The server refuses to start when the session ID is set and the token is empty, and when the config file still holds `noticeSession`.
- **Follows:** [owner notices](./owner-notices.md).
- **Needs:** slice 11.
- **Check:** start-up tests that refuse the old key and a missing token.
- **Built:** `@boxxy/server` reads both variables, and gives the notifier an atc client of its own with the notice token. Start-up tests refuse a config file that holds `noticeSession`, an empty notice token, and a notice session that is no gateway ID, and print no value. The system test `start-server-atc-notice` sends a hold notice to the session by its ID, through a gateway stand-in that takes the notice token alone.

## The deployment

### 13. Notices reach the owner

- **Outcome:** the cloud Secret carries the notice session ID and the notice token, and the plain stack config carries neither. The atc gateway gives the client `boxxy-notices` the message scope only, and the owner's machine grants the principal `service:boxxy-notices` its `local` target, where the notice session runs.
- **Follows:** [owner notices](./owner-notices.md).
- **Needs:** slice 12.
- **Check:** a forced hold reaches the notice session. A notice sent while the session is stopped arrives after it starts, and a notice sent after a rename arrives.

### 14. The review tool in production

- **Outcome:** the agent image ships noslop and runs in production, and the review recipe text runs the command that slice 3 builds. Review sessions alone get the read-only clone token (`Contents: read`, `Pull requests: read`), the one the atc daemon clones with, through a path of their own such as a broker profile for the review recipe; build and design sessions never get it. The noslop App keys sit only in the boxxy server's Secret, and the App is installed on each repo that boxxy starts workers for.
- **Follows:** [the review gate](./review-and-merge.md#the-review-gate); [owner notices](./owner-notices.md#the-review-tool-in-production).
- **Needs:** slice 3.
- **Check:** a live review round leaves noslop's check run at the pull request head, posted by the server. A live build session runs on an agent whose broker profiles leave out the read-only clone token.
- **Built:** the boxxy side is built; the cloud side waits. The example review recipe names the review agent `claude-review`, and its prompt runs the input's command in the session's clone. The server reads its review agents from `spawn.reviewAgents`, and the rules loader refuses `review-agent-outside-review`, `review-without-review-agent`, `review-builder-session` and `review-session-resumed` when any is listed, at start and on each reload. `loadServerRules` takes the same list as its second argument. The `load-rules`, `load-server-rules` and `start-server` tests cover the refusals, and a `build-prompt-values` test renders the review prompt with its command. The cloud side must then:
  1. Ship in the agent image the noslop CLI at the version of boxxy's `@noslop/cli` pin, with Bun and git on the `PATH`.
  2. Add the read-only clone token, with `Contents: read` and `Pull requests: read`, to the broker as a `github` secret, and make it grantable to the worker target.
  3. In the atc config, add a `github` auth profile for that secret, and a stock Claude agent entry for reviews that selects the subscription profile and that profile, and no other GitHub profile. No build or design agent selects it.
  4. In the boxxy server config, list that agent in `spawn.reviewAgents`, and set the `github` section.
  5. In the rules repo, name that agent in the review recipe, and pass the same list to `loadServerRules` in the rules check.
  6. Put `NOSLOP_GITHUB_APP_ID`, `NOSLOP_GITHUB_APP_PRIVATE_KEY` and `NOSLOP_GITHUB_APP_INSTALLATION_ID` in the server's Secret alone, and install the App on each repo in `spawn.repos`.
  7. Run the two live checks above.

## Launch prompts

### 15. Liquid launch prompts

- **Outcome:** a recipe's prompt template is a Liquid template, so a prompt writes `{% if design %}## Design\n\n{{ design }}{% endif %}` and an empty section leaves no bare heading. The section values `acceptance`, `design`, `findings` and `notes` hold their content with no heading, and `ticket` keeps its headings. The rules loader rejects a template that does not parse, uses a tag or filter that is not on the list, names a value that is no placeholder or reads a name from a value, loops over anything but a bare placeholder, builds a range, or reads a field of any value.
- **Follows:** [the launch prompt](./v1.md#the-launch-prompt); [layout](./layout.md#import-pins).
- **Needs:** nothing.
- **Check:** a loader test per rejection (an unknown placeholder, a syntax error, an `include`), a render test of the example build prompt with no design and no findings, and a test that a value holding `{{ }}` or `{% %}` renders as written.
- **Built:** `@boxxy/prompt-template` in `libs/prompt-template` is the only package that imports `liquidjs`. Its `findPromptTemplateFault` runs at load in `@boxxy/rules`, which refuses the rules as `bad-prompt`, and its `renderPromptTemplate` runs at claim in `@boxxy/dispatch`. The engine has no file system and no output escape, reads the empty string as false, and fails on an unknown variable or filter. It registers only the tags and filters listed in the lib's `constants.ts`: no tag that binds a name, such as `assign`, and no filter that reads the clock, such as `date`, or can throw at render. The load check also refuses a name read from a value, a `for` loop over anything but a bare placeholder, a range and a field read on any value, so a template it accepts renders on any placeholder values. The example prompts in `modules/rules/example/prompts/` spell out the title, outcome, body and each section under its heading.

## Held items

### 16. Held items

- **Outcome:** the owner files an item held, edits and notes it while boxxy starts no phase on it, and releases it into its pipeline. `held` is a derived state with its reason, that no waiver lifts. `item_list` lists the held items only, `item_get` lists an item's revisions, and only the owner's path files, releases or lists held items.
- **Follows:** [held items](./planning.md#held-items).
- **Needs:** nothing.
- **Check:** a system test that a tick and an expedite leave a held item unstarted, and that the tick after a release starts its triage; a test that a release of an item that is not held is refused; the access table test.
- **Built:** `item.file` takes `held: { reason }` and writes the item and an `item.held` lever in one change, and `item.release` writes an `item.release` lever or answers `refused` with `not-held`. `findHeldReason` in `@boxxy/model` reads the latest of the two levers, and `deriveItemState` gives `held` right after `archived`, so the frame never takes a held item. `item.retry` refuses a held item with `ITEM_HELD`, so a release always starts at triage. The levers table holds both levers, so the store needs no migration. Both claim stores return the item's `boxxy.item.edited` outbox rows as `revisions` in `readItemDetail`. The CLI adds `item file --held`, `item list --held` and `item release`. The `cli-held-items` system test, the `find-held-reason`, `derive-item-state` and `item-handlers` tests, and the held-item cases of the claim store contract cover it.

## The verify send-back

### 17. The verify send-back and the lost start reply

- **Outcome:** the rework build after a failed verify gets the failed features in its input and in the launch prompt's `findings` section. A builder verify whose fresh start loses its reply still records `resumeFallback: true`, in its `reconciled` fact.
- **Follows:** [the verifier](./review-and-merge.md#the-verifier); `review-and-merge/02-types.ts` and section F of `review-and-merge/03-flow.ts`.
- **Needs:** slice 4.
- **Check:** a build input test per latest grading, a launch prompt test of the verify findings, and a reconcile test per way the claim picked its session.
- **Built:** `SentBack` in `@boxxy/model` is a union of the review send-back and `{ from: 'verify'; head; features }`, where `head` is the head that the verify's input named, or null. `build` in `@boxxy/closeout` reads the latest succeeded review or verify: a review that asked for changes sends its counts, a failed verify sends its features, and any other grading sends none. `getLaunchSections` reads both shapes, and a v1 or stored input with no send-back gives none. The prompt's `findings` lists the failed features under the verify's head. `boxxy.attempt.reconciled` carries `resumeFallback`, which a fact written before the field existed reads as false. The runner's reconcile picks the claim's kept session again, as a respawn does, and sets the flag when the claim wanted a kept session and the running session is not that one. The `@boxxy/pepys` wire schema and its generated boundary gain the optional field. The `build`, `get-launch-sections`, `build-prompt-values`, `claim-next`, `act-on-reading` and `work-fact-schemas` tests cover it.
