import type {
  BuildCloseOut,
  BuildInput,
  CloseOutContext,
  CloseOutProblem,
  Criterion,
  Effect,
  ItemView,
  PhaseInputContext,
} from '@boxxy/model';
import {
  brandSchemas,
  buildCloseOutSchema,
  definePhase,
  reviewCloseOutSchema,
  toJSONValue,
} from '@boxxy/model';
import { match } from 'ts-pattern';
import type { z } from 'zod';
import { buildSchemaParser } from '../build-schema-parser.ts';
import { missingCriteria } from '../missing-criteria.ts';
import { buildCriterionTexts } from '../utils/build-criterion-texts.ts';
import { findLatestCloseOut } from '../utils/find-latest-close-out.ts';
import { findLatestDesign } from '../utils/find-latest-design.ts';
import { findPullRequestLink } from '../utils/find-pull-request-link.ts';

const buildBodySchema = buildCloseOutSchema.omit({ frictionDropped: true });

export const build = definePhase({
  name: brandSchemas.phaseName.parse('build'),
  version: 1,
  worker: brandSchemas.workerKindName.parse('atc.session'),
  outcomes: ['built', 'blocked', 'abandoned'],
  needsAcceptance: true,
  input: (ctx) => toJSONValue(buildBuildInput(ctx)),
  closeOut: buildSchemaParser({
    schema: buildBodySchema,
    toBody: (raw: z.output<typeof buildBodySchema>, frictionDropped): BuildCloseOut => ({
      ...raw,
      frictionDropped,
    }),
    check: collectBuildProblems,
  }),

  // A blocked or abandoned build did not reach its goal, so its attempt fails with the reason,
  // and no session is kept for it.
  settle: (input) => ({
    ...match(input.closeOut.result)
      .with({ kind: 'built' }, () => ({ state: 'succeeded' as const, failure: null }))
      .with({ kind: 'blocked' }, { kind: 'abandoned' }, (ended) => ({
        state: 'failed' as const,
        failure: ended.reason,
      }))
      .exhaustive(),
    outcome: input.closeOut.result.kind,
    effects: collectBuildEffects(input.closeOut, input.item),
    frictionDropped: input.closeOut.frictionDropped,
  }),
});

// The findings come from the latest review, and only when it asked for changes: a build after
// a passed review, sent back by the owner, gets none.
function buildBuildInput(ctx: PhaseInputContext): BuildInput {
  const review = findLatestCloseOut(ctx.history, 'review', reviewCloseOutSchema);

  return {
    acceptance: buildCriterionTexts(ctx.item),
    design: findLatestDesign(ctx.history),
    findings: review?.verdict.kind === 'changes-requested' ? review.verdict.findings : [],
    pullRequest: findPullRequestLink(ctx.pullRequests),
  };
}

function collectBuildProblems(closeOut: BuildCloseOut, ctx: CloseOutContext): CloseOutProblem[] {
  const acceptance = new Set(ctx.item.acceptance.map((criterion) => criterion.id));
  const own = new Set(ctx.evidence.map((row) => row.factId));

  const cited = closeOut.criteria;

  const unknownCriteria = new Set(
    cited.map((entry) => entry.criterion).filter((id) => !acceptance.has(id)),
  );

  const foreignEvidence = new Set(
    cited.map((entry) => entry.evidence).filter((id) => !own.has(id)),
  );

  const missing =
    closeOut.result.kind === 'built' ? missingCriteria(ctx.item, ctx.evidence, cited) : [];

  return [
    ...[...unknownCriteria].map((criterion) => ({ kind: 'unknown-criterion' as const, criterion })),
    ...[...foreignEvidence].map((evidence) => ({ kind: 'foreign-evidence' as const, evidence })),
    ...(missing.length > 0 ? [{ kind: 'built-without-evidence' as const, criteria: missing }] : []),
  ];
}

function collectBuildEffects(closeOut: BuildCloseOut, item: ItemView): Effect[] {
  const acceptance = buildCitedAcceptance(item.acceptance, closeOut.criteria);

  const isChanged = acceptance.some(
    (criterion, index) => criterion.evidence.length !== item.acceptance[index]?.evidence.length,
  );

  return [
    ...closeOut.openItems.map((openItem) => ({ kind: 'file-item' as const, item: openItem })),
    ...(isChanged ? [{ kind: 'set-acceptance' as const, criteria: acceptance }] : []),
    ...closeOut.friction.map((friction) => ({ kind: 'record-proposal' as const, friction })),
  ];
}

// Each criterion gains the evidence ids the close-out cites for it, once each.
function buildCitedAcceptance(
  acceptance: readonly Criterion[],
  cited: BuildCloseOut['criteria'],
): Criterion[] {
  return acceptance.map((criterion) => ({
    ...criterion,
    evidence: [
      ...new Set([
        ...criterion.evidence,
        ...cited.filter((entry) => entry.criterion === criterion.id).map((entry) => entry.evidence),
      ]),
    ],
  }));
}
