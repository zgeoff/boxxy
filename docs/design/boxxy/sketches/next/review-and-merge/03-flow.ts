// Design sketch. It is not compiled.
//
// 03-flow.ts: the bodies that decide the order of the steps, the retries and each change of state.
// Every other function throws "not implemented".
//
//   A. A job attempt on each tick.
//   B. The review close-out.
//   C. The round and its cause.
//   D. The merge rule.
//   E. The merge job and its one action.
//   F. The kept session, widened for the verify phase.
//   G. The caps, from the engine as it is.

import type { AttemptRow, CommitSha, Forge, GateReading, GateRecord, Instant, JobReading, JobStep, JobWorker, JsonValue, MergeObservation, MergeRequest, MergeRules, ReviewCloseOut, ReviewGate, RoundCause, Settled } from '@boxxy/model';
import { match } from 'ts-pattern';

// ── A. A job attempt on each tick (modules/dispatch/src/jobs/run-job-reading.ts) ───────────────
//
// The readings loop of the tick visits every live attempt, as in v1. An attempt whose worker is a
// job takes this path in place of the session's reconcile table. A job attempt uses the same
// machine and the same one writer of attempt state, with four of its states:
//
//   claimed ─▶ starting ──job-started──▶ running ──job-finished──▶ closing ──settled──▶ succeeded | failed
//   starting: the first read moves it to running; a job starts nothing outside boxxy
//   running ──acted, answered, waited──▶ running
//   closing ─▶ settle in the same tick: a job holds no session to stop
//
// The lease and a `jobs` seat are held from the claim to the settle, so one item never runs two
// merges at once.

export async function runJobReading(deps: JobDeps): Promise<void> {
  const { attempt, job } = deps;

  if (attempt.state === 'closing') {
    return applyJobMove(deps, { kind: 'settle', forced: null });
  }

  // A merge job reads the forge at most once per `timeouts.jobReadSeconds`.
  if (attempt.readAt !== null && deps.now - attempt.readAt < deps.readSeconds * 1000) {
    return;
  }

  const reading: JobReading = await job.read(attempt); // throws on no answer: the attempt stays as it is

  if (attempt.state === 'starting') await applyJobMove(deps, { kind: 'job-started' });

  const deadlinePassed = deps.now - attempt.claimedAt > deps.step.timeoutMinutes * 60_000;
  const step = deps.phase.drive({ observed: reading.observed, attempt, deadlinePassed, rules: deps.rules, now: deps.now });

  return match(step)
    .with({ kind: 'finish' }, (finish) => applyJobMove(deps, { kind: 'job-finished', closeOut: finish.closeOut })) // parsed by the phase kind; a refused body is a bug: log it, settle `closeout-unsettleable`
    .with({ kind: 'wait' }, (wait) => applyJobMove(deps, { kind: 'waited', reason: wait.reason, pending: wait.pending }))
    .with({ kind: 'act' }, (act) => runJobAction(deps, act.action))
    .exhaustive();
}

// ── B. The review close-out (modules/dispatch/src/closeouts/close-out-call.ts) ─────────────────
//
// The review round runs in an agent session on an agent host, through `atc.session`, as a
// build does. Its input carries the command that `ReviewGate.buildCommand` gave; the session runs
// it in its own clone, where the tool fetches the pull request's base and head, and sends the tool's raw result with `boxxy attempt
// close-out`. The server keeps the forge and the tool's App keys: the agent host gets neither.
//
// The `attempt.closeOut` procedure calls `closeOutCall`, which calls this for a review attempt,
// before the close-out change of v1. It runs outside the lock, because `accept` posts to the forge. The close-out hash covers
// the session's raw body, never the built `ReviewCloseOut`: the procedure answers a repeat of a
// stored body as `recorded` with `repeat: true` before `accept` runs, so a lost answer to the
// session posts nothing twice. A close-out that the session sends again after a server crash,
// with nothing stored, runs `accept` again.

export async function runReviewCloseOut(deps: { gate: ReviewGate; forge: Forge; attempt: AttemptRow & { readonly input: unknown }; earlier: GateReading | null; body: JsonValue }): Promise<ReviewCloseOut> {
  const input = parseRoundInput(deps.attempt.input);
  const reading = await deps.gate.accept({ attempt: deps.attempt.id, pullRequest: input.pullRequest, round: input.round, cause: input.cause }, deps.body);
  const earlier = deps.earlier; // the item's latest settled review, from the store

  if (input.cause === 'first' || earlier === null || earlier.status === 'not-covered' || reading.status === 'not-covered') {
    return { round: input.round, cause: input.cause, reading, unrelatedLines: null }; // the phase kind's parser reads this as the close-out
  }

  const changed = await deps.forge.readChangedFiles(input.pullRequest.repo, earlier.head, reading.head);

  return { round: input.round, cause: input.cause, reading, unrelatedLines: countUnrelatedLines(changed, earlier.findingPaths) };
}

// Pure (modules/closeout). The changed lines in files that had no open finding at the earlier review.
export function countUnrelatedLines(changed: readonly { path: string; changedLines: number }[], findingPaths: readonly string[]): number {
  const withFindings = new Set(findingPaths);

  return changed.filter((file) => !withFindings.has(file.path)).reduce((sum, file) => sum + file.changedLines, 0);
}

// ── C. The round and its cause (modules/closeout/src/review/build-round-cause.ts) ──────────────
//
// Pure, over the item's settled attempts since its latest retry lever, oldest first.
//   round  1 + the reviews since that lever that settled `changes-requested`. So round 4 is the
//          last: the edge `changes-requested: { max: 3 }` holds the item when it blocks.
//   cause  `first` when no review of this pull request settled since the lever;
//          `rework` when the latest settled attempt before this one that is not a build is a
//          review that settled `changes-requested`;
//          `recheck` otherwise: the item came back from a merge (`repair`, `stale`) or a verify,
//          or the last round settled `failed` and the edge `again` runs it once more. The
//          tool's plain review reads the whole change when no earlier review of it succeeded.

export function buildRoundCause(history: readonly Settled[]): RoundCause {
  const reviews = history.filter((settled) => settled.phase === 'review' && settled.outcome !== 'lost');

  if (reviews.length === 0) return 'first';

  const latestOther = history.findLast((settled) => settled.phase !== 'build');

  return latestOther?.phase === 'review' && latestOther.outcome === 'changes-requested' ? 'rework' : 'recheck';
}

// ── D. The merge rule (modules/train/src/decide-merge.ts) ──────────────────────────────────────
//
// Pure. First match wins. Every green answer needs a record at `observed.head`.

export function decideMerge(input: { observed: MergeObservation; rules: MergeRules; deadlinePassed: boolean; acted: MergeRequest | null; now: Instant; actRetryMinutes: number }): JobStep {
  const { observed } = input;
  const required = [...new Set([...input.rules.checks, ...observed.baseRequired])];
  // the full `MergeCloseOut`: its schema is strict, so each finish carries every field
  const finish = (outcome: MergeOutcome, extra: Partial<MergeCloseOut> = {}): JobStep => ({
    kind: 'finish',
    closeOut: { outcome, head: observed.head, required, failed: [], cause: null, mergeCommit: null, reason: null, byBoxxy: false, verify: observed.verify, ...extra },
  });

  // 1. Merged by boxxy on an earlier read, by a merge queue, or by a person.
  if (observed.state === 'merged') return finish('merged', { mergeCommit: observed.mergeCommit, byBoxxy: input.acted?.head === observed.head });
  // 2. Closed with no merge: the item holds for the owner.
  if (observed.state === 'closed') return finish('closed');
  // 3. The review must have passed at this head. A push after the review sends the item back to it.
  if (!isPassedAt(observed.review, observed.head)) return finish('stale');
  // 4. A conflict with the base needs an agent: a repair build rebases.
  if (observed.mergeable === 'conflict') return finish('repair', { cause: 'conflict', failed: [] });

  const red = required.filter((name) => observed.checks.get(name) === 'failure');

  // 5. A red required check needs an agent.
  if (red.length > 0) return finish('repair', { cause: 'checks-red', failed: red });

  // 6. Wait while a check has no run at this head, has not finished, or ended other than
  //    `success` or `failure` (skipped, neutral, cancelled): none of these is green. Wait too
  //    while GitHub has not worked out the merge state. Past the step's time limit, hold.
  const pending = required.filter((name) => observed.checks.get(name) !== 'success');

  if (pending.length > 0 || observed.mergeable === 'unknown') {
    const reason = pending.length > 0 ? 'checks pending' : 'mergeable state unknown';

    return input.deadlinePassed ? finish('stalled') : { kind: 'wait', reason, pending };
  }

  // 7. Every check is green. The verify reading must cover this head too. `incomplete` cannot
  //    reach here while the gate check is in `required`; it is checked so a rules file without
  //    the gate check never merges an unverified head.
  if (observed.verify.status !== 'verified') return finish('unverified');

  // 8. GitHub refused a merge of this clean, green head: a ruleset or a repo setting that boxxy
  //    cannot fix. The item holds for the owner.
  const sent = input.acted?.head === observed.head ? input.acted : null;

  if (sent?.answer?.kind === 'not-mergeable') return finish('refused', { reason: sent.answer.reason });

  // 9. A request already sent at this head: wait for step 1, and send it again only after
  //    `actRetryMinutes`. A second call is safe: GitHub merges only at `sha`. Past the step's time
  //    limit, hold.
  if (sent !== null && input.deadlinePassed) return finish('stalled');
  if (sent !== null && input.now - sent.at < input.actRetryMinutes * 60_000) {
    return { kind: 'wait', reason: 'merge requested', pending: [] };
  }

  return { kind: 'act', action: { kind: 'merge', unit: { members: [{ pullRequest: observed.pullRequest, head: observed.head }] }, method: input.rules.method, required } };
}

function isPassedAt(review: GateRecord | null, head: CommitSha): boolean {
  return review !== null && review.status === 'passed' && review.head === head;
}

// ── E. The merge job (modules/dispatch/src/jobs/create-merge-job.ts) ───────────────────────────
//
// The job starts nothing. Each `read` makes the observation: the pull request, its
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
//   3. When the forge answered: the move `answered` sets `actedAnswer` and writes
//      `boxxy.merge.answered`. The next read decides the outcome: `merged` and `queued` reach
//      step 1 of the rule; `head-moved` reads as `stale` at step 3; `not-mergeable` finishes
//      `refused` at step 8 when the head is still clean and green, and otherwise reaches the step
//      that matches what changed. With no answer, nothing more is written, and step 9 sends the
//      call again.

export async function runJobAction(deps: JobDeps, action: { kind: 'merge' }): Promise<void> {
  const marked = await applyJobMove(deps, { kind: 'acted', action });

  if (marked === 'refused') return;

  const answer = await deps.job.act(deps.attempt, action);

  if (answer.kind !== 'unknown') await applyJobMove(deps, { kind: 'answered', answer });
}

// ── F. The kept session, widened (modules/dispatch/src/sessions/) ──────────────────────────────
//
//   - A build that settles `built` keeps its session when an edge back to build has
//     `resume: true`, or when the item's verify recipe has `session: builder`.
//   - A verify attempt with `session: builder` is claimed through `worker.resumeKept`, as a rework
//     build is. When the wake fails or the item keeps no session, it falls back to a fresh
//     session, and `started` says `resumeFallback: true`, so pepys can drop the attempt from the
//     comparison of graders. When that start's reply is lost, the reconcile picks the kept
//     session again, and `reconciled` says `resumeFallback: true` when the running session is not
//     the kept one.
//   - A `session: builder` verify attempt that settles `verified` or `failed` keeps its session
//     again, so a repair or a rework that follows wakes the builder that wrote and graded the
//     code. A `session: fresh` verify leaves the build's kept session on the item.
//   - A kept session is forgotten 24 hours after it was kept, as in v1. A merge that waits longer
//     on CI sends its repair to a fresh session.

// ── G. The caps (libs/model/src/pipeline/advance.ts, no change) ────────────────────────────────
//
// `advance` counts each backward edge per phase and outcome, from the item's latest retry lever:
//
//   edge                                       hold                       the owner reads
//   ─────────────────────────────────────────  ─────────────────────────  ──────────────────────────────────────
//   review  changes-requested { max: 3 }       the 4th one             rounds used up (review changes-requested)
//   merge   repair            { max: 3 }       the 4th one                rounds used up (merge repair)
//   merge   stale             { max: 3 }       the 4th one                rounds used up (merge stale)
//   merge   unverified        { max: 2 }       the 3rd one                rounds used up (merge unverified)
//   verify  failed            { max: 2 }       the 3rd one                rounds used up (verify failed)
//   review  failed            again, maxAttempts 2   the 2nd in a row    attempts used up (review)
//   verify  abandoned         again, maxAttempts 2   the 2nd in a row    attempts used up (verify)
//
// Each hold writes its notice row in the settle's lock, as in v1. `boxxy item retry <item>`
// resets every count. An item whose pull request the owner merged by hand moves on with
// `boxxy item retry <item> --phase merge`: the merge job reads `merged` and the item ends.

interface JobDeps {
  readonly attempt: AttemptRow & { readonly readAt: Instant | null; readonly claimedAt: Instant };
  readonly job: JobWorker;
  readonly phase: { readonly drive: (ctx: never) => JobStep }; // the loader refuses a job phase kind with no `drive`
  readonly step: { readonly timeoutMinutes: number };
  readonly rules: unknown;
  readonly now: Instant;
  readonly readSeconds: number;
}

declare function applyJobMove(deps: JobDeps, move: unknown): Promise<'applied' | 'refused'>;
declare function parseRoundInput(input: unknown): { pullRequest: never; round: number; cause: RoundCause };
