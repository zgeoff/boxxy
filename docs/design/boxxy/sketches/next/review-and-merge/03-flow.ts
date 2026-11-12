// Design sketch. It is not compiled.
//
// 03-flow.ts: the bodies that decide the order of the steps, the retries and each change of state.
// Every other function throws "not implemented".
//
//   A. A job attempt on each tick.
//   B. The review job.
//   C. The round and its cause.
//   D. The merge rule.
//   E. The merge job and its one action.
//   F. The kept session, widened for the verify phase.
//   G. The caps, from the engine as it is.

import type { AttemptRow, CommitSha, Forge, GateRecord, Instant, JobReading, JobStep, JobWorker, MergeObservation, MergeRules, ReviewGate, RoundCause, Settled } from '@boxxy/model';
import { match } from 'ts-pattern';

// ── A. A job attempt on each tick (modules/dispatch/src/jobs/run-job-reading.ts) ───────────────
//
// The readings loop of the tick visits every live attempt, as in v1. An attempt whose worker is a
// job takes this path in place of the session's reconcile table. A job attempt uses the same
// machine and the same one writer of attempt state, with four of its states:
//
//   claimed ─▶ starting ──job-started──▶ running ──job-finished──▶ closing ──settled──▶ succeeded | failed
//   starting, refused for capacity ─▶ settle `no-capacity`; refused otherwise ─▶ settle `spawn-refused`
//   starting, unknown ─▶ reconciling; the next tick sends `start` again with the same key
//   running ──acted, waited──▶ running
//   running, reading `absent` ─▶ settle `job-lost` (outcome `lost`, edge `again`)
//   closing ─▶ settle in the same tick: a job holds no session to stop
//
// The lease and a `jobs` seat are held from the claim to the settle, so one item never runs two
// reviews or two merges at once.

export async function runJobReading(deps: JobDeps): Promise<void> {
  const { attempt, job } = deps;

  if (attempt.state === 'starting' || attempt.state === 'reconciling') {
    const started = await job.start(attempt);

    return applyJobMove(deps, match(started)
      .with({ kind: 'started' }, (answer) => ({ kind: 'job-started', head: answer.head }) as const)
      .with({ kind: 'refused', cause: 'capacity' }, () => ({ kind: 'settle', forced: 'no-capacity' }) as const)
      .with({ kind: 'refused' }, () => ({ kind: 'settle', forced: 'spawn-refused' }) as const)
      .with({ kind: 'unknown' }, () => ({ kind: 'spawn-unanswered' }) as const)
      .exhaustive());
  }

  if (attempt.state === 'closing') {
    return applyJobMove(deps, { kind: 'settle', forced: null });
  }

  // A merge job reads the forge at most once per `timeouts.jobReadSeconds`.
  if (attempt.readAt !== null && deps.now - attempt.readAt < deps.readSeconds * 1000) {
    return;
  }

  const reading: JobReading = await job.read(attempt); // throws on no answer: the attempt stays as it is
  const step = pickJobStep({ reading, attempt, deps });

  return match(step)
    .with({ kind: 'lost' }, () => applyJobMove(deps, { kind: 'settle', forced: 'job-lost' }))
    .with({ kind: 'finish' }, (finish) => applyJobMove(deps, { kind: 'job-finished', closeOut: finish.closeOut })) // parsed by the phase kind; a refused body is a bug: log it, settle `closeout-unsettleable`
    .with({ kind: 'wait' }, (wait) => applyJobMove(deps, { kind: 'waited', reason: wait.reason, pending: wait.pending }))
    .with({ kind: 'act' }, (act) => runJobAction(deps, act.action))
    .exhaustive();
}

// Pure. A finished job result beats the clock. A job with no `drive` (the review) only waits,
// until the step's time limit stops it as `timed-out`, which settles `lost`.
export function pickJobStep(input: { reading: JobReading; attempt: AttemptRow; deps: JobDeps }): JobStep | { kind: 'lost' } {
  const { reading, attempt, deps } = input;
  const deadlinePassed = deps.now - (attempt.startedAt ?? attempt.claimedAt) > deps.step.timeoutMinutes * 60_000;

  if (reading.kind === 'absent') return { kind: 'lost' };
  if (reading.kind === 'finished') return { kind: 'finish', closeOut: reading.closeOut };
  if (deps.phase.drive === undefined) return deadlinePassed ? { kind: 'lost' } : { kind: 'wait', reason: 'running', pending: [] };

  return deps.phase.drive({ observed: reading.observed, attempt, deadlinePassed, rules: deps.rules, now: deps.now });
}

// ── B. The review job (modules/dispatch/src/jobs/create-review-job.ts) ─────────────────────────

export function createReviewJob(deps: { gate: ReviewGate; forge: Forge }): JobWorker {
  return {
    start: async (attempt) => {
      const input = parseRoundInput(attempt.input);
      // The head comes from the forge now: no stored row holds a fresh head.
      const pullRequest = await deps.forge.readPullRequest(input.pullRequest);

      if (pullRequest === 'not-found' || pullRequest.state !== 'open') {
        return { kind: 'refused', cause: 'other', reason: 'the pull request is not open' };
      }

      const started = await deps.gate.start({ key: attempt.id, pullRequest: input.pullRequest, head: pullRequest.head, round: input.round, cause: input.cause });

      return started.kind === 'started' ? { kind: 'started', head: pullRequest.head } : started.kind === 'refused' ? { kind: 'refused', cause: 'other', reason: started.reason } : started;
    },
    read: async (attempt) => {
      const round = await deps.gate.read(attempt.id);

      return match(round)
        .with({ kind: 'running' }, () => ({ kind: 'running', observed: null }) as const)
        .with({ kind: 'absent' }, () => ({ kind: 'absent' }) as const)
        // The parser refuses a reading whose head is not `attempt.head`. A `not-covered` reading
        // settles `failed`, and the edge `again` runs the round once more.
        .with({ kind: 'finished' }, (finished) => ({ kind: 'finished', closeOut: toReviewCloseOut(attempt, finished.reading) }) as const)
        .exhaustive();
    },
    act: () => {
      throw new Error('a review job has no action');
    },
  };
}

// ── C. The round and its cause (modules/closeout/src/phases/review.ts, `buildRoundInput`) ──────
//
// Pure, over the item's settled attempts since its latest retry lever, oldest first.
//   round  1 + the reviews since that lever that settled `changes-requested`. So round 3 is the
//          last: the edge `changes-requested: { max: 2 }` holds the item when it blocks.
//   cause  `first` when no review of this pull request settled since the lever;
//          `rework` when the latest settled attempt before this one that is not a build is a
//          review that settled `changes-requested`;
//          `recheck` otherwise: the item came back from a merge (`repair`, `stale`) or a verify.

export function buildRoundCause(history: readonly Settled[]): RoundCause {
  const reviews = history.filter((settled) => settled.phase === 'review' && settled.outcome !== 'lost');

  if (reviews.length === 0) return 'first';

  const latestOther = history.findLast((settled) => settled.phase !== 'build');

  return latestOther?.phase === 'review' && latestOther.outcome === 'changes-requested' ? 'rework' : 'recheck';
}

// ── D. The merge rule (modules/train/src/decide-merge.ts) ──────────────────────────────────────
//
// Pure. First match wins. Every green answer needs a record at `observed.head`.

export function decideMerge(input: { observed: MergeObservation; rules: MergeRules; deadlinePassed: boolean; acted: { at: Instant; head: CommitSha } | null; now: Instant }): JobStep {
  const { observed } = input;
  const finish = (outcome: string, extra: object = {}): JobStep => ({ kind: 'finish', closeOut: { outcome, head: observed.head, verify: observed.verify, ...extra } });

  // 1. Merged by boxxy on an earlier read, by a merge queue, or by a person.
  if (observed.state === 'merged') return finish('merged', { mergeCommit: observed.mergeCommit, byBoxxy: input.acted?.head === observed.head });
  // 2. Closed with no merge: the item holds for the owner.
  if (observed.state === 'closed') return finish('closed');
  // 3. The review must have passed at this head. A push after the review sends the item back to it.
  if (!isPassedAt(observed.review, observed.head)) return finish('stale');
  // 4. A conflict with the base needs an agent: a repair build rebases.
  if (observed.mergeable === 'conflict') return finish('repair', { cause: 'conflict', failed: [] });

  const required = [...new Set([...input.rules.checks, ...observed.baseRequired])];
  const red = required.filter((name) => observed.checks.get(name) === 'failure');

  // 5. A red required check needs an agent.
  if (red.length > 0) return finish('repair', { cause: 'checks-red', failed: red });

  // 6. Wait while a check has no run at this head, has not finished, or ended other than
  //    `success` or `failure` (skipped, neutral, cancelled): none of these is green. Wait too
  //    while GitHub has not worked out the merge state. Past the step's time limit, hold.
  const pending = required.filter((name) => observed.checks.get(name) !== 'success');

  if (pending.length > 0 || observed.mergeable === 'unknown') {
    return input.deadlinePassed ? finish('stalled', { pending }) : { kind: 'wait', reason: 'checks pending', pending };
  }

  // 7. Every check is green. The verify reading must cover this head too. `incomplete` cannot
  //    reach here while the gate check is in `required`; it is checked so a rules file without
  //    the gate check never merges an unverified head.
  if (observed.verify.status !== 'verified') return finish('unverified');

  // 8. A request already sent at this head: wait for step 1, and send it again only after
  //    `actRetryMinutes`. A second call is safe: GitHub merges only at `sha`.
  if (input.acted?.head === observed.head && input.now - input.acted.at < 5 * 60_000) {
    return { kind: 'wait', reason: 'merge requested', pending: [] };
  }

  return { kind: 'act', action: { kind: 'merge', unit: { members: [{ pullRequest: observed.pullRequest, head: observed.head }] }, method: input.rules.method } };
}

function isPassedAt(review: GateRecord | null, head: CommitSha): boolean {
  return review !== null && review.status === 'passed' && review.head === head;
}

// ── E. The merge job (modules/dispatch/src/jobs/create-merge-job.ts) ───────────────────────────
//
// `start` reads nothing and starts nothing. `read` makes the observation: the pull request, its
// mergeable state, the checks at its head, the base branch's required checks, the verify reading
// at the head, and the item's latest settled review from the store. Each forge call throws on no
// answer, and the tick reads again later.
//
// The action, in three moves, the order of the sleep's:
//   1. In the lock, under the attempt's lease: the move `acted` sets `actedAt` and `actedHead`,
//      and writes `boxxy.merge.requested`. A refused move (another runner, a moved row) sends
//      nothing.
//   2. Outside the lock: `forge.mergeAtHead(pullRequest, head, method)`. GitHub merges only when the
//      head is still `head`, so boxxy never merges a head whose checks it did not read.
//   3. When the forge answered: write `boxxy.merge.answered`. The next read decides the outcome:
//      `merged` and `queued` reach step 1 of the rule; `head-moved` reads as `stale` at step 3;
//      `not-mergeable` with a clean mergeable state finishes `refused` (a ruleset or a setting that
//      boxxy cannot fix). With no answer, nothing more is written, and step 8 sends the call again.

export async function runJobAction(deps: JobDeps, action: { kind: 'merge' }): Promise<void> {
  const marked = await applyJobMove(deps, { kind: 'acted', action });

  if (marked === 'refused') return;

  const answer = await deps.job.act(deps.attempt, action);

  if (answer.kind !== 'unknown') await writeMergeAnswered(deps, answer);
}

// ── F. The kept session, widened (modules/dispatch/src/sessions/) ──────────────────────────────
//
//   - A build that settles `built` keeps its session when an edge back to build has
//     `resume: true`, or when the item's verify recipe has `session: builder`.
//   - A verify attempt with `session: builder` is claimed through `worker.resumeKept`, as a rework
//     build is. When the wake fails, it falls back to a fresh session, and `started` says
//     `resumeFallback: true`, so pepys can drop the attempt from the comparison of graders.
//   - A verify attempt that settles keeps its session again, so a repair or a rework that follows
//     wakes the builder that wrote and graded the code.
//   - A kept session is forgotten 24 hours after it was kept, as in v1. A merge that waits longer
//     on CI sends its repair to a fresh session.

// ── G. The caps (libs/model/src/pipeline/advance.ts, no change) ────────────────────────────────
//
// `advance` counts each backward edge per phase and outcome, from the item's latest retry lever:
//
//   edge                                       hold                       the owner reads
//   ─────────────────────────────────────────  ─────────────────────────  ──────────────────────────────────────
//   review  changes-requested { max: 2 }       the 3rd one                rounds used up (review changes-requested)
//   merge   repair            { max: 3 }       the 4th one                rounds used up (merge repair)
//   merge   stale             { max: 3 }       the 4th one                rounds used up (merge stale)
//   verify  failed            { max: 2 }       the 3rd one                rounds used up (verify failed)
//   review  failed            again, maxAttempts 2                       attempts used up (review)
//
// Each hold writes its notice row in the settle's lock, as in v1. `boxxy item retry <item>`
// resets every count. An item whose pull request the owner merged by hand moves on with
// `boxxy item retry <item> --phase merge`: the merge job reads `merged` and the item ends.

interface JobDeps {
  readonly attempt: AttemptRow & { readonly readAt: Instant | null; readonly startedAt: Instant | null; readonly claimedAt: Instant; readonly input: unknown };
  readonly job: JobWorker;
  readonly phase: { readonly drive?: (ctx: never) => JobStep };
  readonly step: { readonly timeoutMinutes: number };
  readonly rules: unknown;
  readonly now: Instant;
  readonly readSeconds: number;
}

declare function applyJobMove(deps: JobDeps, move: unknown): Promise<'applied' | 'refused'>;
declare function parseRoundInput(input: unknown): { pullRequest: never; round: number; cause: RoundCause };
declare function toReviewCloseOut(attempt: AttemptRow, reading: unknown): never;
declare function writeMergeAnswered(deps: JobDeps, answer: unknown): Promise<void>;
