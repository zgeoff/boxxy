// Design sketch. It is not compiled.
//
// 01-usage.ts: the calling code of the review gate, the verifier and the merge step.
//
//   1. rules.yaml: the steps after build, the merge block, the limits.
//   2. The phase kinds: review and merge run on job workers, verify on a session.
//   3. The server: the registry of workers, and the adapters.
//   4. The adapters: the review tool and the verify tool, mapped to the ports.
//   5. What the owner sees.

import type { GateReading, MergeObservation, ReviewGate, Verifier, WorkerRegistry } from '@boxxy/model';
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
//       - phase: review                          # job worker `review.round`
//         maxAttempts: 2                         # a lost or failed round runs again, at the same round
//         timeoutMinutes: 45
//         on:
//           passed: next
//           changes-requested: { to: build, max: 2, resume: true }   # 3 rounds: the 3rd blocked round holds
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
//     core.issue: { pipeline: standard, recipes: { ..., build: build-v2, review: review-gate, verify: verify-builder, merge: merge-direct } }
//     core.idea:  { pipeline: standard, recipes: { ..., build: build-v2, review: review-gate, verify: verify-fresh, merge: merge-direct } }
//
//   recipes:
//     build-v2:       { agent: claude, model: claude-opus-5-5, effort: medium, skills: [] }
//                     # its text: answer each finding where `sentBack.answerHint` says, then push
//     verify-builder: { agent: claude, model: claude-opus-5-5, effort: medium, session: builder, skills: [verify] }
//     verify-fresh:   { agent: claude, model: claude-opus-5-5, effort: medium, session: fresh,   skills: [verify] }
//     review-gate:    { agent: none }        # a job recipe: no prompt, no model; the hash still names it
//     merge-direct:   { agent: none }
//
//   merge:
//     method: squash
//     checks: ['pr / checks', 'verify / gate']   # one aggregate CI job, and the verify gate
//
//   limits:
//     - { name: workers, max: 7,  counts: { phase: [triage, design, build, verify] } }   # agent sessions
//     - { name: jobs,    max: 20, counts: { phase: [review, merge] } }                   # no session seat
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

// ── 2. modules/closeout/src/phases/review.ts and merge.ts ──────────────────────────────────────

export const review = definePhase({
  name: brandSchemas.phaseName.parse('review'),
  version: 2,
  worker: brandSchemas.workerKindName.parse('review.round'),
  outcomes: ['passed', 'changes-requested', 'failed'], // pepys's stage-time query reads the first two
  needsAcceptance: true,
  input: (ctx) => toJSONValue(buildRoundInput(ctx)), // { pullRequest, round, cause }: 03-flow.ts, section C
  closeOut: reviewCloseOutParser, // refuses a reading for another head than the attempt's
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
// outcomes `verified`, `failed`, `blocked` and `abandoned`. Its input is the pull request and its
// head, with no acceptance text: the grader takes the features in scope from the verify tool.

// ── 3. apps/server/src/start-server.ts ─────────────────────────────────────────────────────────

import { createGithubForge } from '@boxxy/forge-github';
import { createNoslopReviewGate } from '@boxxy/review-noslop';
import { createWringerVerifier } from '@boxxy/verifier-wringer';
import { createAtcWorker } from '@boxxy/worker-atc';
import { createMergeJob, createReviewJob } from '@boxxy/dispatch';

const forge = createGithubForge({ baseUrl: config.github.baseUrl, token: env.BOXXY_GITHUB_TOKEN, fetch });

// The review tool runs as a detached child process of the server, one per round, keyed by the
// review attempt's ID. The server's image holds the tool, its GitHub App keys and its model login.
const reviewGate: ReviewGate = createNoslopReviewGate({ command: ['noslop'], stateFolder: `${config.stateFolder}/reviews`, spawn: Bun.spawn, env: secrets.review });

// Parses the verify tool's report and reads its gate check through the forge port; no I/O of its own.
const verifier: Verifier = createWringerVerifier({ forge, gateCheck: 'verify / gate' });

const workers: WorkerRegistry = new Map([
  [brandSchemas.workerKindName.parse('atc.session'), { shape: 'session', worker: createAtcWorker({ client: atc, trustedFolders, credentialSources }) }],
  [brandSchemas.workerKindName.parse('review.round'), { shape: 'job', worker: createReviewJob({ gate: reviewGate, forge }) }],
  [brandSchemas.workerKindName.parse('merge.forge'), { shape: 'job', worker: createMergeJob({ forge, verifier, store }) }],
]);

// The loader gets the worker names, as it gets the phase kinds and the concepts.
const rules = loadRules(text, { phases: phaseKinds, concepts, workers: [...workers.keys()] });

// ── 4. The adapters ────────────────────────────────────────────────────────────────────────────
//
// adapters/review-noslop: `createNoslopReviewGate`. Each round writes `<stateFolder>/<key>/`: a
// pid file, the run's stdout, and `done` when the run exits. `start` creates the folder with an
// exclusive create first, so a second `start` with the same key starts nothing.
//
//   cause     command (each with `--pr <n> --repo <owner/name> --report github --json`)
//   ────────  ────────────────────────────────────────────────────────────────────────────────────
//   first     `noslop review --full`
//   rework    `noslop review --fixes-only`. When its result's `fixChecks` holds no verdict (no
//             `fixed` answer got a call, or every call failed), the run read nothing at the head,
//             though its `head` field names the head. The adapter then runs `noslop review` in the
//             same round, and builds the reading from that run, so the round covers the head.
//   recheck   `noslop review`: reads the files whose patch changed since the last review, and runs
//             a resolution check on a merge of the base
//
// `read(key)`: a live pid ─▶ `running`. No folder ─▶ `absent`. A folder with no live pid and no
// complete result ─▶ `absent`. A complete result ─▶ the adapter runs `noslop findings --json` and
// builds the reading:
//
//   GateReading field   from
//   ─────────────────   ─────────────────────────────────────────────────────────────────────────
//   head                the result's `head`; `not-covered` when it is not the round's head
//   status, why         `findings` exits 1 ─▶ blocked `unreadable`; any `failedCalls` ─▶ blocked
//                       `failed-call`; any finding in state `open` ─▶ blocked `open-findings`;
//                       else passed. noslop's own check run is never read: it passes at a head
//                       that no review read, and after a failed call.
//   open                findings in state `open`, by severity: P1 ─▶ high, P2 ─▶ medium, P3 ─▶ low
//   closedWithoutFix    findings in state `not-a-defect`, `deferred` or `accepted-risk`
//   cost                each entry of `calls`: model, the four token counts, `durationMs`
//   ref                 `reviewID`
//   answerHint          "Run `noslop findings --pr <n> --repo <owner/name> --json`, and reply to
//                       each open finding with a disposition: fixed, not-a-defect, deferred or
//                       accepted-risk."
//
// A second `review` at a head the last review read reads no file, and the verdict comes from the
// findings, never from the run's own list, so a round that runs again after a crash is safe.
//
// adapters/verifier-wringer: `createWringerVerifier`. `readAt(pullRequest, head)` reads the
// latest run of the gate check at `head` and the pull request body, through the forge port:
//
//   gate check at `head`   report in the body        reading
//   ────────────────────   ───────────────────────   ────────────────────────────────────────
//   none, or pending       any                       not-covered
//   success                parses                    verified, with the report's features
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
//   rounds    review 2 of 3 · repair 0 of 3
//
// A held item names the cap: `waiting (rounds used up: review changes-requested, then build)`.
//
// `boxxy runner status` adds a `jobs` list, from the tick's readings:
//
//   jobs   it-42 merge  #7  3f2a91c  waiting 12m  pr / checks: pending
//          it-51 review #2  3c4d5e6  running 4m   round 2 (rework)

declare const config: { github: { baseUrl: string }; stateFolder: string };
declare const env: { BOXXY_GITHUB_TOKEN: string | undefined };
declare const secrets: { review: Record<string, string> };
declare const atc: unknown, trustedFolders: unknown, credentialSources: unknown, store: unknown, text: string, phaseKinds: unknown, concepts: unknown;
declare function loadRules(text: string, registries: unknown): unknown;
declare function buildRoundInput(ctx: unknown): unknown;
declare function findPullRequestLink(pullRequests: unknown): unknown;
declare function parseMergeObservation(observed: unknown): MergeObservation;
declare function readActed(attempt: unknown): { at: number; head: string } | null;
declare const reviewCloseOutParser: unknown, mergeCloseOutParser: unknown;
