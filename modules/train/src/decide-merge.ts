import type {
  CommitSha,
  GateRecord,
  JobStep,
  MergeCloseOut,
  MergeObservation,
  MergeOutcome,
  UnreadableMerge,
} from '@boxxy/model';
import { toJSONValue } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { matchSignoffRules } from './match-signoff-rules.ts';
import type { DecideMergeInput } from './types.ts';

const minuteMs = 60_000;
const maxSignoffPaths = 50;

// The merge rule: one step for each read of a merge attempt. It checks the rows of the merge
// table from the top, and the first match wins. A merge needs a passed review at the head and
// every required check green; the base branch's own rules say which checks those are.
export function decideMerge(input: DecideMergeInput): JobStep {
  const observed = input.observed;

  // no later read can give a head, so only the owner moves the merge on
  if (observed.state === 'unreadable') {
    return buildBlocked(observed);
  }

  const required = [...new Set([...input.rules.checks, ...observed.baseRequired])];

  const matched = matchSignoffRules(
    input.rules.signoff,
    observed.pullRequest,
    observed.changedPaths,
  );

  const isTruncated = observed.changedPaths.kind === 'truncated';

  const signoff: MergeCloseOut['signoff'] =
    matched.rules.length > 0 || isTruncated
      ? {
          rules: matched.rules,
          paths: matched.paths.slice(0, maxSignoffPaths),
          truncated: isTruncated,
        }
      : null;

  const finish = (outcome: MergeOutcome, fields: Partial<MergeCloseOut> = {}): JobStep =>
    buildFinish(observed, required, outcome, { signoff, ...fields });

  if (observed.state === 'merged') {
    return finish('merged', {
      mergeCommit: observed.mergeCommit,
      byBoxxy: input.acted?.head === observed.head,
    });
  }

  if (observed.state === 'closed') {
    return finish('closed');
  }

  // a verdict counts only at the head the job read
  const verdict = observed.signoff?.head === observed.head ? observed.signoff : null;

  if (verdict?.verdict === 'send-back') {
    invariant(verdict.findings !== null, 'a send-back verdict carries its findings');

    return finish('changes-requested', {
      sentBack: { head: verdict.head, findings: verdict.findings },
    });
  }

  // a push after the review sends the item back to it
  if (!isPassedAt(observed.review, observed.head)) {
    return finish('stale');
  }

  if (observed.mergeable === 'conflict') {
    return finish('repair', { cause: 'conflict' });
  }

  const red = required.filter((name) => observed.checks.get(name) === 'failure');

  if (red.length > 0) {
    return finish('repair', { cause: 'checks-red', failed: red });
  }

  // a check with no run, one still going, or one that ended neither success nor failure is not
  // green; nor is a head whose mergeable state GitHub has not worked out yet
  const pending = required.filter((name) => observed.checks.get(name) !== 'success');

  if (pending.length > 0 || observed.mergeable === 'unknown') {
    return input.deadlinePassed
      ? finish('stalled')
      : {
          kind: 'wait',
          reason: pending.length > 0 ? 'checks pending' : 'mergeable state unknown',
          pending,
        };
  }

  const sent = input.acted?.head === observed.head ? input.acted : null;

  if (sent?.answer?.kind === 'not-mergeable') {
    return finish('refused', { reason: sent.answer.reason });
  }

  if ((matched.rules.length > 0 || isTruncated) && verdict?.verdict !== 'approve') {
    return finish('needs-signoff');
  }

  if (sent !== null && input.deadlinePassed) {
    return finish('stalled');
  }

  // a second call is safe, because the forge merges only at the head it names
  if (sent !== null && input.now - sent.at < input.actRetryMinutes * minuteMs) {
    return { kind: 'wait', reason: 'merge requested', pending: [] };
  }

  return {
    kind: 'act',
    action: {
      kind: 'merge',
      unit: { members: [{ pullRequest: observed.pullRequest, head: observed.head }] },
      method: input.rules.method,
      required,
    },
  };
}

function buildBlocked(observed: UnreadableMerge): JobStep {
  const closeOut: MergeCloseOut = {
    outcome: 'blocked',
    head: null,
    required: [],
    failed: [],
    cause: null,
    mergeCommit: null,
    reason: formatReadProblem(observed),
    byBoxxy: false,
    verify: null,
    signoff: null,
    sentBack: null,
  };

  return { kind: 'finish', closeOut: toJSONValue(closeOut) };
}

function formatReadProblem(observed: UnreadableMerge): string {
  if (observed.problem === 'no-pull-request') {
    return 'the item has no pull request';
  }

  const name = `${observed.pullRequest.repo}#${observed.pullRequest.number}`;

  return observed.problem === 'no-commit'
    ? `the pull request ${name} has no commit`
    : `the forge holds no pull request ${name}`;
}

function buildFinish(
  observed: MergeObservation,
  required: readonly string[],
  outcome: MergeOutcome,
  fields: Partial<MergeCloseOut>,
): JobStep {
  const closeOut: MergeCloseOut = {
    outcome,
    head: observed.head,
    required,
    failed: [],
    cause: null,
    mergeCommit: null,
    reason: null,
    byBoxxy: false,
    verify: observed.verify,
    signoff: null,
    sentBack: null,
    ...fields,
  };

  return { kind: 'finish', closeOut: toJSONValue(closeOut) };
}

function isPassedAt(review: GateRecord | null, head: CommitSha): boolean {
  return review?.status === 'passed' && review.head === head;
}
