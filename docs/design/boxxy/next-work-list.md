# Next work list

Build three designs in the 14 slices below, in order: [review, verify and merge](./review-and-merge.md), [wringer journeys](./wringer-journeys.md) and [owner notices](./owner-notices.md). Each slice gives its outcome, the doc and sketch files it follows, what it needs first, and the check that proves it. Slices 1 to 12 need nothing outside this repo except wringer 0.2.0. Slices 13 and 14 change the cloud repo's deployment and each need a decision from the owner.

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

### 3. The review phase

- **Outcome:** `createReviewPhase`, `buildRoundCause`, the `review-run` recipe, and the close-out procedure that runs `accept` with the hash of the raw body. `adapters/review-noslop` builds the command, with the plain review when a rework judged no fix, and accepts the result through `sendResult` and `check`. The v1 `ReviewCloseOut` and `NoslopSummary` are gone, and the v1 sketch lines that named them are rewritten.
- **Follows:** [the review gate](./review-and-merge.md#the-review-gate); `review-and-merge/01-usage.ts`.
- **Needs:** slice 1.
- **Check:** the adapter tests in the doc's acceptance table, the system test of a restart between the post and the store, and a test that refuses a close-out from another session.

### 4. The verify phase

- **Outcome:** the verify phase kind, the recipe field `session: builder|fresh`, the kept-session rule for verify, and `resumeFallback` on a fallback to a fresh session.
- **Follows:** [the verifier](./review-and-merge.md#the-verifier).
- **Needs:** slice 1.
- **Check:** the kept-session tests, and the loader refusal builder-session-not-kept.

## Wringer journeys

### 5. The verify CLI and the harness

- **Outcome:** `bun verify` with the registry, the harness, `runBoxxy` and the map from paths to features, all in `system-tests/src/test-utils/verify/`, and `makeBrokerSend` in `@boxxy/system-tests/test-utils`. The verify and wringer skills, `.wringer/` in `.gitignore`, the import-zones entry for wringer, the layout row, and the grading steps in AGENTS.md.
- **Follows:** [wringer journeys](./wringer-journeys.md); `wringer-journeys/01-usage.ts` and `02-types.ts`.
- **Needs:** wringer 0.2.0.
- **Check:** a fresh agent with only the verify skill reaches `done` on all three journeys. The journeys pass in a network namespace with only loopback up. `bun verify lint` and `bun run check:test-layout` pass, and a test fails on a tracked path that the map neither maps nor ignores.

### 6. The CI gate

- **Outcome:** `.github/workflows/verify.yml` runs the `verify / gate` check, with the `ci:verify-gate` script and its annotations, and the `verify:lint` script.
- **Follows:** [wringer journeys](./wringer-journeys.md); `wringer-journeys/03-flow.ts`.
- **Needs:** slice 5.
- **Check:** a pull request that changes a mapped path fails with no report and passes with one. A pull request that changes only a README passes, and so does one that changes only the lock file.

### 7. The Verifier adapter

- **Outcome:** `adapters/verifier-wringer` fills `VerifyReading` through `readAt`, from the gate run and the report in the pull request body.
- **Follows:** [the verifier](./review-and-merge.md#the-verifier).
- **Needs:** slices 1 and 6.
- **Check:** adapter tests for `verified`, `incomplete` and `not-covered`.

## The merge step

### 8. The forge merge and the merge phase

- **Outcome:** `adapters/forge-github` reads the checks, the required checks and the mergeable state, and merges at a head with `mergeAtHead`. `decideMerge` in `modules/train` decides each merge read, the merge phase runs it, and the `record-merge` effect is guarded by the pull request row's state.
- **Follows:** [the merge step](./review-and-merge.md#the-merge-step); `review-and-merge/03-flow.ts`.
- **Needs:** slices 2 and 7.
- **Check:** one `decideMerge` test per row of the merge table, forge tests on recorded GitHub answers, and the merge journey in `system-tests/e2e/`.

### 9. Stage time for the merge step

- **Outcome:** the pepys stage-time query starts the merge step at the claim of the first merge attempt after the latest passed review.
- **Follows:** [facts and pepys](./review-and-merge.md#facts-and-pepys).
- **Needs:** slice 8.
- **Check:** a stage-time query test.

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

### 12. The notice session by ID, with its own token

- **Outcome:** the config key `atc.notices.session` replaces `noticeSession`, and the server reads `BOXXY_ATC_NOTICE_TOKEN`. The server refuses to start when notices are on and the token is empty.
- **Follows:** [owner notices](./owner-notices.md).
- **Needs:** slice 11.
- **Check:** config tests that refuse the old key and a missing token.

## The deployment

### 13. Notices reach the owner

- **Outcome:** the cloud stack config and Secret carry the notice session ID and the notice token. The atc gateway gives the client `boxxy-notices` the message scope only, and the owner's machine lets the principal `service:boxxy-notices` reach the notice session.
- **Follows:** [owner notices](./owner-notices.md).
- **Needs:** slice 12, and the owner's choice of the grant's target.
- **Check:** a forced hold reaches the notice session. A notice sent while the session is stopped arrives after it starts, and a notice sent after a rename arrives.

### 14. The review tool in production

- **Outcome:** the agent image ships noslop and runs in production, and the review recipe text runs the command that slice 3 builds. The noslop App keys sit only in the boxxy server's Secret, and the App is installed on each repo that boxxy starts workers for.
- **Follows:** [the review gate](./review-and-merge.md#the-review-gate); [owner notices](./owner-notices.md#the-review-tool-in-production).
- **Needs:** slice 3, and the owner's choice of the GitHub token that a review session gets.
- **Check:** a live review round leaves noslop's check run at the pull request head, posted by the server.
