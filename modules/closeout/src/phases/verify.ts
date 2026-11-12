import type { PhaseInputContext, VerifyCloseOut, VerifyInput } from '@boxxy/model';
import {
  brandSchemas,
  definePhase,
  storedReviewCloseOutSchema,
  toJSONValue,
  verifyCloseOutSchema,
  verifyInputSchema,
} from '@boxxy/model';
import { match } from 'ts-pattern';
import type { z } from 'zod';
import { buildSchemaParser } from '../build-schema-parser.ts';
import { findLatestCloseOut } from '../utils/find-latest-close-out.ts';
import { findPullRequestLink } from '../utils/find-pull-request-link.ts';

// the parser copies `session` from the attempt's input, so the agent never sends it
const verifyBodySchema = verifyCloseOutSchema.omit({ session: true, frictionDropped: true });

export const verify = definePhase({
  name: brandSchemas.phaseName.parse('verify'),
  version: 1,
  worker: brandSchemas.workerKindName.parse('atc.session'),
  outcomes: ['verified', 'failed', 'blocked', 'abandoned'],
  needsAcceptance: true,
  input: (ctx) => toJSONValue(buildVerifyInput(ctx)),
  closeOut: buildSchemaParser({
    schema: verifyBodySchema,
    toBody: (raw: z.output<typeof verifyBodySchema>, frictionDropped, ctx): VerifyCloseOut => ({
      ...raw,
      session: verifyInputSchema.parse(ctx.input).session,
      frictionDropped,
    }),
    check: () => [],
  }),

  // A failed verify graded the work, so it succeeds, and a `session: builder` grader keeps its
  // session for the rework. A blocked or abandoned verify graded nothing, and fails.
  settle: (input) => ({
    ...match(input.closeOut.result)
      .with({ kind: 'verified' }, { kind: 'failed' }, () => ({
        state: 'succeeded' as const,
        failure: null,
      }))
      .with({ kind: 'blocked' }, { kind: 'abandoned' }, (ended) => ({
        state: 'failed' as const,
        failure: ended.kind,
      }))
      .exhaustive(),
    outcome: input.closeOut.result.kind,
    effects: input.closeOut.friction.map((friction) => ({
      kind: 'record-proposal' as const,
      friction,
    })),
    frictionDropped: input.closeOut.frictionDropped,
  }),
});

// A recipe with no `session` field starts a fresh grader.
function buildVerifyInput(ctx: PhaseInputContext): VerifyInput {
  const reading = findLatestCloseOut(ctx.history, 'review', storedReviewCloseOutSchema)?.reading;

  return {
    pullRequest: findPullRequestLink(ctx.pullRequests),
    head: reading?.status === 'passed' ? reading.head : null,
    session: ctx.session ?? 'fresh',
  };
}
