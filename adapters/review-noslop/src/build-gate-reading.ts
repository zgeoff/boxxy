import type { CommitSha, GateReading, GateRound, GateRun, SeverityCounts } from '@boxxy/model';
import type { FindingList, ReviewResult } from '@noslop/cli';
import type { PullRequestCheck } from '@noslop/cli/check';
import { buildGateCost } from './build-gate-cost.ts';

export interface GateReadingInput {
  readonly round: GateRound;

  // the result `sendResult` matched to the pull request's head, and posted
  readonly head: CommitSha;
  readonly review: ReviewResult;

  // the `noslop findings` output from before the post, and its exit code
  readonly list: FindingList | null;
  readonly listExitCode: number | null;

  // `check` after the post: the findings still open at the head
  readonly outcome: PullRequestCheck;
}

interface KnownFinding {
  readonly severity: 'P1' | 'P2' | 'P3';
  readonly path: string;
}

const closedWithoutFixStates = new Set(['not-a-defect', 'deferred', 'accepted-risk']);

// The noslop check run is never read: it passes at a head that no review read, and after a failed
// call. Only `check`'s own answer, after the post, counts.
export function buildGateReading(input: GateReadingInput): GateReading {
  const listed = input.list?.findings ?? [];

  const known = new Map<string, KnownFinding>([
    ...input.review.findings.map(
      (finding) => [finding.id, { severity: finding.severity, path: finding.anchor.path }] as const,
    ),
    ...listed.map(
      (finding) => [finding.id, { severity: finding.severity, path: finding.path }] as const,
    ),
  ]);

  const openIDs = new Set(input.outcome.open.map((finding) => finding.id));

  const open = [...openIDs].map((id) => known.get(id) ?? null);

  const run: GateRun = {
    head: input.head,
    open: buildSeverityCounts(open),
    closedWithoutFix: listed.filter(
      (finding) => closedWithoutFixStates.has(finding.state) && !openIDs.has(finding.id),
    ).length,
    findingPaths: [
      ...new Set(open.flatMap((finding) => (finding === null ? [] : [finding.path]))),
    ].toSorted(),
    cost: buildGateCost(input.review),
    ref: input.review.reviewID,
    answerHint: `Run \`noslop findings --pr ${input.round.pullRequest.number} --repo ${input.round.pullRequest.repo} --json\`, and reply to each open finding with a disposition: fixed, not-a-defect, deferred or accepted-risk.`,
  };

  if (input.listExitCode !== 0 || input.list === null) {
    return { status: 'blocked', why: 'unreadable', ...run };
  }

  if (input.review.failedCalls.length > 0) {
    return { status: 'blocked', why: 'failed-call', ...run };
  }

  if (open.length > 0) {
    return { status: 'blocked', why: 'open-findings', ...run };
  }

  // a failure with no open finding: a finding's marker became unreadable
  if (input.outcome.conclusion !== 'success') {
    return { status: 'blocked', why: 'unreadable', ...run };
  }

  return { status: 'passed', ...run };
}

// An open finding that neither the result nor the list names counts as high, so it never lowers
// the bar.
function buildSeverityCounts(open: readonly (KnownFinding | null)[]): SeverityCounts {
  const count = (severity: KnownFinding['severity']) =>
    open.filter((finding) => (finding?.severity ?? 'P1') === severity).length;

  return { high: count('P1'), medium: count('P2'), low: count('P3') };
}
