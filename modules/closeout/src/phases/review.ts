import type { PhaseInputContext, ReviewCloseOut, ReviewInput } from '@boxxy/model';
import { brandSchemas, definePhase, reviewCloseOutSchema, toJSONValue } from '@boxxy/model';
import type { z } from 'zod';
import { buildSchemaParser } from '../build-schema-parser.ts';
import { buildNoslopSummary } from '../noslop/build-noslop-summary.ts';
import { noslopReportSchema } from '../noslop/noslop-report-schema.ts';
import { buildCriterionTexts } from '../utils/build-criterion-texts.ts';
import { findLatestDesign } from '../utils/find-latest-design.ts';
import { findPullRequestLink } from '../utils/find-pull-request-link.ts';

// The session sends noslop's whole result; the stored close-out holds its summary instead.
const reviewBodySchema = reviewCloseOutSchema
  .omit({ frictionDropped: true })
  .extend({ noslop: noslopReportSchema });

export const review = definePhase({
  name: brandSchemas.phaseName.parse('review'),
  version: 1,
  worker: brandSchemas.workerKindName.parse('atc.session'),
  outcomes: ['passed', 'changes-requested'],
  needsAcceptance: true,
  input: (ctx) => toJSONValue(buildReviewInput(ctx)),
  closeOut: buildSchemaParser({
    schema: reviewBodySchema,
    toBody: (raw: z.output<typeof reviewBodySchema>, frictionDropped): ReviewCloseOut => ({
      ...raw,
      noslop: buildNoslopSummary(raw.noslop),
      frictionDropped,
    }),
    check: (closeOut) =>
      closeOut.verdict.kind === 'changes-requested' && closeOut.verdict.findings.length === 0
        ? [{ kind: 'phase-rule', message: 'changes-requested needs at least one finding' }]
        : [],
  }),
  settle: (input) => ({
    state: 'succeeded',
    failure: null,
    outcome: input.closeOut.verdict.kind,
    effects: input.closeOut.friction.map((friction) => ({ kind: 'record-proposal', friction })),
    frictionDropped: input.closeOut.frictionDropped,
  }),
});

function buildReviewInput(ctx: PhaseInputContext): ReviewInput {
  return {
    acceptance: buildCriterionTexts(ctx.item),
    design: findLatestDesign(ctx.history),
    pullRequest: findPullRequestLink(ctx.pullRequests),
  };
}
