import type { CommitSha, GateCost, GateRound, JsonValue } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import type { FindingList, ReviewResult } from '@noslop/cli';
import { findingListSchema, reviewResultSchema } from '@noslop/cli';
import { z } from 'zod';
import { buildGateCost } from './build-gate-cost.ts';

// The file the review command writes: the git head of the checkout, the review's JSON, and the
// output of `noslop findings` with its exit code. A part the command could not read is null.
const reviewBodySchema = z.object({
  head: z.string().nullable(),
  review: z.unknown(),
  findings: z.object({ exitCode: z.number().int().nullable(), list: z.unknown() }),
});

export type ParsedReviewBody =
  | {
      readonly kind: 'postable';
      readonly head: CommitSha;
      readonly review: ReviewResult;

      // null when `noslop findings` failed or printed no list
      readonly list: FindingList | null;
    }
  | { readonly kind: 'not-covered'; readonly head: CommitSha; readonly cost: GateCost };

const noHead = brandSchemas.commitSha.parse('0'.repeat(40));

// Picks what `accept` can post. A result it can't post reads not-covered: one that does not
// parse, one for another pull request, and a `--fixes-only` run that judged no fix, which read
// nothing at its head though its `head` names that head.
export function parseReviewBody(round: GateRound, body: JsonValue): ParsedReviewBody {
  const envelope = reviewBodySchema.safeParse(body);

  if (!envelope.success) {
    return { kind: 'not-covered', head: noHead, cost: { calls: [] } };
  }

  const review = reviewResultSchema.safeParse(envelope.data.review);

  if (!review.success) {
    const checkoutHead = brandSchemas.commitSha.safeParse(envelope.data.head);

    return {
      kind: 'not-covered',
      head: checkoutHead.success ? checkoutHead.data : noHead,
      cost: { calls: [] },
    };
  }

  const head = brandSchemas.commitSha.safeParse(review.data.head);

  if (!head.success) {
    return { kind: 'not-covered', head: noHead, cost: buildGateCost(review.data) };
  }

  if (!isRoundPullRequest(round, review.data) || isFixesOnlyWithNoVerdict(review.data)) {
    return { kind: 'not-covered', head: head.data, cost: buildGateCost(review.data) };
  }

  const list = findingListSchema.safeParse(envelope.data.findings.list);

  return {
    kind: 'postable',
    head: head.data,
    review: review.data,
    list: list.success && envelope.data.findings.exitCode === 0 ? list.data : null,
  };
}

function isRoundPullRequest(round: GateRound, review: ReviewResult): boolean {
  return (
    review.pullRequest !== null &&
    `${review.pullRequest.owner}/${review.pullRequest.repo}` === round.pullRequest.repo &&
    review.pullRequest.number === round.pullRequest.number
  );
}

function isFixesOnlyWithNoVerdict(review: ReviewResult): boolean {
  return review.fixesOnly === true && (review.fixChecks ?? []).length === 0;
}
