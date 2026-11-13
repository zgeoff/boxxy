// Design sketch. It is not compiled.
//
// 01-usage.ts: the calling code of the review gate, the verifier and the merge step.
//
//   1. rules.yaml: the steps after build, the merge block, the limits.
//   2. The phase kinds: review and verify run in sessions, merge on a job worker.
//   3. The server: the registry of workers, and the adapters.
//   4. The adapters: the review tool and the verify tool, mapped to the ports.
//   5. What the owner sees.

import type { GateReading, MergeObservation, MergeRequest, ReviewGate, Verifier, WorkerRegistry } from '@boxxy/model';
import { brandSchemas, definePhase, toJSONValue } from '@boxxy/model';
import { decideMerge } from '@boxxy/train';

// ── 1. modules/rules/example/rules.yaml ────────────────────────────────────────────────────────
//
// The steps after build. Triage and design do not change. Every outcome has an edge.
//
//   pipelines:
//     standard:
//       # triage, design: as in v1
//       - phase: build
//         maxAttempts: 2
//         timeoutMinutes: 180
//         on: { built: next, blocked: { hold: blocked }, abandoned: again }
//       - phase: review                          # a session on an agent host runs the review tool
//         maxAttempts: 2                         # a lost or failed round runs again, at the same round
//         timeoutMinutes: 45
//         on:
//           passed: next
//           changes-requested: { to: build, max: 3, resume: true }   # the 4th changes-requested holds
//           failed: again
//       - phase: verify                          # an agent session; the recipe says who grades
//         maxAttempts: 2
//         timeoutMinutes: 90
//         on:
//           verified: next
//           failed: { to: build, max: 2, resume: true }
//           blocked: { hold: blocked }
//           abandoned: again
//       - phase: merge                           # job worker `merge.forge`
//         maxAttempts: 2
//         timeoutMinutes: 240                    # past it, a merge that still waits on checks finishes `stalled`
//         on:
//           merged: { end: merged }
//           repair: { to: build, max: 3, resume: true }   # a conflict or a red check: 3 repair rounds
//           stale: { to: review, max: 3 }                 # the head is not the head the review passed
//           unverified: { to: verify, max: 2 }            # no verdict at the head
//           closed: { hold: pull-request-closed }
//           stalled: { hold: checks-stalled }
//           refused: { hold: merge-refused }
//
//   kinds:
//     core.issue: { pipeline: standard, recipes: { ..., build: build-v2, review: review-run, verify: verify-builder, merge: merge-direct } }
//     core.idea:  { pipeline: standard, recipes: { ..., build: build-v2, review: review-run, verify: verify-fresh, merge: merge-direct } }
//
//   recipes:
//     build-v2:       { agent: claude, model: claude-opus-5-5, effort: medium, skills: [] }
//                     # its text: answer each finding where `sentBack.answerHint` says, then push
//     verify-builder: { agent: claude, model: claude-opus-5-5, effort: medium, session: builder, skills: [verify] }
//     verify-fresh:   { agent: claude, model: claude-opus-5-5, effort: medium, session: fresh,   skills: [verify] }
//     review-run:     { agent: claude, model: claude-haiku-5-5, effort: low, skills: [] }
//                     # its text: run `input.command` in the checkout, then send the file it
//                     # wrote with `boxxy attempt close-out --file`. The agent judges nothing.
//     merge-direct:   { agent: none }        # a job recipe: no prompt, no model; the hash still names it
//
//   merge:
//     method: squash
//     checks: ['pr / checks', 'verify / gate']   # one aggregate CI job, and the verify gate
//
//   limits:
//     - { name: workers, max: 7,  counts: { phase: [triage, design, build, verify, review] } }   # agent sessions
//     - { name: jobs,    max: 20, counts: { phase: [merge] } }   # a merge that waits on CI holds no session seat
//     - { name: owner-design, max: 1, counts: { phase: [design], designMode: [attended] } }
//
//   pools:
//     # triage, design-with-owner, design, build: as in v1, and:
//     - { name: review, takes: { phase: review }, order: [oldest] }
//     - { name: verify, takes: { phase: verify }, order: [oldest] }
//     - { name: merge,  takes: { phase: merge },  order: [oldest] }
//
// Two kinds take the two verify recipes, so pepys compares the builder grading its own work with
// a fresh session: the recipe hash on `claimed` and `session` on the verify close-out tell them apart.

// ── 2. modules/closeout/src/phases/create-review-phase.ts and merge.ts ────────────────────────

// The server passes the gate's pure `buildCommand`, so the module never imports an adapter.
export const createReviewPhase = (deps: Pick<ReviewGate, 'buildCommand'>) => definePhase({
  name: brandSchemas.phaseName.parse('review'),
  version: 2,
  worker: brandSchemas.workerKindName.parse('atc.session'),
  outcomes: ['passed', 'changes-requested', 'failed'], // pepys's stage-time query reads the first two
  needsAcceptance: true,
  // { pullRequest, round, cause, command }: the round and cause from 03-flow.ts, section C
  input: (ctx) => {
    const round = buildRoundInput(ctx);

    return toJSONValue({ ...round, command: deps.buildCommand(round) });
  },
  closeOut: reviewCloseOutParser, // reads the `ReviewCloseOut` that the server built with `accept`
  settle: (input) => {
    const outcome = pickReviewOutcome(input.closeOut.reading);

    return { state: outcome === 'failed' ? 'failed' : 'succeeded', failure: outcome === 'failed' ? 'review-failed' : null, outcome, effects: [], frictionDropped: 0 };
  },
});

// `passed` ─▶ passed. `blocked` with open findings ─▶ changes-requested. A failed call, an
// unreadable result or `not-covered` ─▶ failed: boxxy cannot tell whether the head is clear.
function pickReviewOutcome(reading: GateReading): 'passed' | 'changes-requested' | 'failed' {
  throw new Error('not implemented');
}

export const merge = definePhase({
  name: brandSchemas.phaseName.parse('merge'),
  version: 1,
  worker: brandSchemas.workerKindName.parse('merge.forge'),
  outcomes: ['merged', 'repair', 'stale', 'unverified', 'closed', 'stalled', 'refused'],
  needsAcceptance: true,
  input: (ctx) => toJSONValue({ pullRequest: findPullRequestLink(ctx.pullRequests) }),
  // No agent decides the merge: the runner calls this pure rule on each read of the job.
  drive: (ctx) => decideMerge({ observed: parseMergeObservation(ctx.observed), rules: ctx.rules.merge, deadlinePassed: ctx.deadlinePassed, acted: readActed(ctx.attempt), now: ctx.now }),
  closeOut: mergeCloseOutParser,
  // `merged` asks for one effect, `record-merge`: the pull request row moves to merged and
  // `boxxy.pull_request.merged` is written, unless the watch already did. The row's state guards it.
  settle: (input) => ({
    state: input.closeOut.outcome === 'merged' ? 'succeeded' : 'failed',
    failure: input.closeOut.outcome === 'merged' ? null : input.closeOut.outcome,
    outcome: input.closeOut.outcome,
    effects: input.closeOut.outcome === 'merged' ? [{ kind: 'record-merge', head: input.closeOut.head, mergeCommit: input.closeOut.mergeCommit }] : [],
    frictionDropped: 0,
  }),
});

// The verify phase kind (modules/closeout/src/phases/verify.ts) runs on `atc.session`, with the
// outcomes `verified`, `failed`, `blocked` and `abandoned`. Its input is the pull request, the head
// that the latest passed review read, and the recipe's `session`, with no acceptance text: the
// grader takes the features in scope from the verify tool. `verified` and `failed` succeed, so a
// `session: builder` grader keeps its session for the rework; `blocked` and `abandoned` fail.

// ── 3. apps/server/src/start-server.ts ─────────────────────────────────────────────────────────

import { createGithubForge } from '@boxxy/forge-github';
import { createNoslopReviewGate } from '@boxxy/review-noslop';
import { createWringerVerifier } from '@boxxy/verifier-wringer';
import { createAtcWorker } from '@boxxy/worker-atc';
import { createMergeJob } from '@boxxy/dispatch';

const forge = createGithubForge({ baseUrl: config.github.baseUrl, token: env.BOXXY_GITHUB_TOKEN, fetch });

// The review tool runs on an agent host, whose image pins it. The server keeps the tool's GitHub
// App keys and uses them only to check and post a result; no agent host gets them.
const reviewGate: ReviewGate = createNoslopReviewGate({ appEnv: secrets.review });

// Parses the verify tool's report and reads its gate check through the forge port; no I/O of its own.
const verifier: Verifier = createWringerVerifier({ forge, gateCheck: 'verify / gate' });

const workers: WorkerRegistry = new Map([
  [brandSchemas.workerKindName.parse('atc.session'), { shape: 'session', worker: createAtcWorker({ client: atc, trustedFolders, credentialSources }) }],
  [brandSchemas.workerKindName.parse('merge.forge'), { shape: 'job', worker: createMergeJob({ forge, verifier, store }) }],
]);

// The loader gets the worker names, as it gets the phase kinds and the concepts.
const rules = loadRules(text, { phases: [...phaseKinds, createReviewPhase(reviewGate)], concepts, workers: [...workers.keys()] });

// The `attempt.closeOut` procedure runs a review attempt's body through `reviewGate.accept`
// (03-flow.ts, section B) before the close-out change.

// ── 4. The adapters ────────────────────────────────────────────────────────────────────────────
//
// adapters/review-noslop: `createNoslopReviewGate`. It imports `@noslop/cli/post` and
// `@noslop/cli/check`, and holds the noslop App's keys in `appEnv`.
//
// `buildCommand(round)` gives a command that writes one JSON file: `review`, the result of the
// review below, and `findings`, the output of `noslop findings --pr <n> --repo <owner/name>
// --json` with its exit code. Each review takes `--pr <n> --repo <owner/name> --adapter claude
// --report json --json`. `--report` replaces the config's reporters, so the agent host posts
// nothing. `--adapter claude` uses the model sign-in that the agent host's broker gives.
//
//   cause     review
//   ────────  ────────────────────────────────────────────────────────────────────────────────────
//   first     `noslop review --full`
//   rework,   `noslop review --fixes-only`. When its `fixChecks` is empty (no `fixed` answer got a
//   recheck   verdict, such as when every answer is `not-a-defect`, or a repair added no answer),
//             the run read nothing at its head, though its `head` field names that head. The
//             command then runs `noslop review`, which reads the files whose patch changed since
//             the last review, and keeps that result, so the review covers the head.
//
// `accept(round, body)`, in the server:
//   1. A `--fixes-only` result with an empty `fixChecks` reads `not-covered`, and nothing is
//      posted. The command never sends one; the check stops a session that skipped the fallback.
//   2. `sendResult` from `@noslop/cli/post` checks the result against the pull request's head and
//      the base branch's config, then posts it as the App. A refused result reads `not-covered`.
//   3. `check(pr, { readOnly: true })` from `@noslop/cli/check` gives the findings still open.
//
//   GateReading field   from
//   ─────────────────   ─────────────────────────────────────────────────────────────────────────
//   head                the result's `head`, which step 2 matched to the pull request's head
//   status, why         `findings` exited 1 ─▶ blocked `unreadable`; any `failedCalls` ─▶ blocked
//                       `failed-call`; any open finding from step 3 ─▶ blocked `open-findings`;
//                       a step 3 `conclusion` other than `success`, with no open finding (a
//                       finding's marker became unreadable) ─▶ blocked `unreadable`; else passed. The `noslop` check run is never read: it passes at a head
//                       that no review read, and after a failed call.
//   open                the open findings, by severity, from the result's `findings` and the
//                       `findings` list: P1 ─▶ high, P2 ─▶ medium, P3 ─▶ low
//   closedWithoutFix    findings in state `not-a-defect`, `deferred` or `accepted-risk`
//   findingPaths        the `path` of each open finding
//   cost               each entry of `calls`: model, the four token counts, `durationMs`
//   ref                 `reviewID`
//   answerHint          "Run `noslop findings --pr <n> --repo <owner/name> --json`, and reply to
//                       each open finding with a disposition: fixed, not-a-defect, deferred or
//                       accepted-risk."
//
// adapters/verifier-wringer: `createWringerVerifier`. `readAt(pullRequest, head)` reads the
// latest run of the gate check at `head` and the pull request body, through the forge port:
//
//   gate check at `head`   report in the body        reading
//   ────────────────────   ───────────────────────   ────────────────────────────────────────
//   none, or pending       any                       not-covered
//   other (cancelled ...)  any                       not-covered
//   success             parses                    verified, with the report's features
//   failure                parses                    incomplete, with the report's features
//   success or failure     absent or does not parse  incomplete, with no features
//
// The report is the JSON in the HTML comment at the end of `bun verify report --human`. The
// fingerprint needs a checkout, so boxxy never computes it: the gate check in CI does.

// ── 5. What the owner sees ─────────────────────────────────────────────────────────────────────
//
// `boxxy item get it-42`:
//
//   state     running (merge: waiting on pr / checks)
//   pull      example/app#87  head 3f2a91c
//   review    round 2 at 3f2a91c: passed · round 1 at 9c01e2d: changes requested (high 1, medium 2)
//   verify    verified at 3f2a91c by the builder: 3 features verified, 2 unchanged
//   merge     attempt 1, waiting since 14:02 on: pr / checks
//   rounds    review send-backs 1 of 3 · repair 0 of 3
//
// A held item names the cap: `waiting (rounds used up: review changes-requested, then build)`.
//
// `boxxy runner status` adds a `jobs` list, from the tick's readings:
//
//   jobs   it-42 merge  #7  3f2a91c  waiting 12m  pr / checks: pending
//
// A review round shows in the session list, as a build does, with its round and cause.

declare const config: { github: { baseUrl: string } };
declare const env: { BOXXY_GITHUB_TOKEN: string | undefined };
declare const secrets: { review: Record<string, string> };
declare const atc: unknown, trustedFolders: unknown, credentialSources: unknown, store: unknown, text: string, phaseKinds: unknown, concepts: unknown;
declare function loadRules(text: string, registries: unknown): unknown;
declare function buildRoundInput(ctx: unknown): unknown;
declare function findPullRequestLink(pullRequests: unknown): unknown;
declare function parseMergeObservation(observed: unknown): MergeObservation;
declare function readActed(attempt: unknown): MergeRequest | null; // from `actedAt`, `actedHead` and `actedAnswer`
declare const reviewCloseOutParser: unknown, mergeCloseOutParser: unknown;
