import type { AttemptRow, MergeCloseOut, MergeInput, MergeRequest } from '@boxxy/model';
import {
  brandSchemas,
  definePhase,
  mergeCloseOutSchema,
  mergeInputSchema,
  mergeObservationSchema,
  toJSONValue,
} from '@boxxy/model';
import { decideMerge } from '@boxxy/train';
import invariant from 'tiny-invariant';
import { buildSchemaParser } from '../build-schema-parser.ts';
import { findPullRequestLink } from '../utils/find-pull-request-link.ts';

// No agent decides a merge: the runner calls the pure merge rule on each read of the job, and
// writes the close-out that the rule finishes with.
export const merge = definePhase({
  name: brandSchemas.phaseName.parse('merge'),
  version: 1,
  worker: brandSchemas.workerKindName.parse('merge.forge'),
  outcomes: ['merged', 'repair', 'stale', 'unverified', 'closed', 'stalled', 'refused'],
  needsAcceptance: true,
  input: (ctx) => {
    const input: MergeInput = { pullRequest: findPullRequestLink(ctx.pullRequests) };

    return toJSONValue(input);
  },
  drive: (ctx) => {
    invariant(ctx.rules.merge !== null, 'the loader refuses a merge step with no merge block');

    return decideMerge({
      observed: mergeObservationSchema.parse(ctx.observed),
      rules: ctx.rules.merge,
      deadlinePassed: ctx.deadlinePassed,
      acted: findMergeRequest(ctx.attempt),
      now: ctx.now,
      actRetryMinutes: ctx.actRetryMinutes,
    });
  },
  closeOut: buildSchemaParser({
    schema: mergeCloseOutSchema,
    toBody: (raw): MergeCloseOut => raw,
    check: () => [],
  }),
  settle: (input) => {
    const closeOut = input.closeOut;
    const isMerged = closeOut.outcome === 'merged';
    const pullRequest = mergeInputSchema.parse(input.attempt.input).pullRequest;

    return {
      state: isMerged ? 'succeeded' : 'failed',
      failure: isMerged ? null : closeOut.outcome,
      outcome: closeOut.outcome,
      effects:
        isMerged && pullRequest !== null
          ? [
              {
                kind: 'record-merge',
                pullRequest: { repo: pullRequest.repo, number: pullRequest.number },
                mergeCommit: closeOut.mergeCommit,
              },
            ]
          : [],
      frictionDropped: 0,
    };
  },
});

// the last request that the runner marked on the attempt row, with the forge's answer once one came
function findMergeRequest(attempt: AttemptRow): MergeRequest | null {
  return attempt.actedAt === null || attempt.actedHead === null
    ? null
    : { at: attempt.actedAt, head: attempt.actedHead, answer: attempt.actedAnswer };
}
