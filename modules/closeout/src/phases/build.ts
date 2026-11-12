import type {
  BuildCloseOut,
  BuildInput,
  CloseOutContext,
  CloseOutProblem,
  Criterion,
  Effect,
  ItemView,
  PhaseInputContext,
  SentBack,
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

  // A blocked or abandoned build did not reach its goal, so its attempt fails and keeps no
  // session. The failure is the outcome name: the agent's reason is free text, and the engine
  // reads some failure names, such as `no-capacity`. The reason stays in the close-out.
  settle: (input) => ({
    ...match(input.closeOut.result)
      .with({ kind: 'built' }, () => ({ state: 'succeeded' as const, failure: null }))
      .with({ kind: 'blocked' }, { kind: 'abandoned' }, (ended) => ({
        state: 'failed' as const,
        failure: ended.kind,
      }))
      .exhaustive(),
    outcome: input.closeOut.result.kind,
    effects: collectBuildEffects(input.closeOut, input.item),
    frictionDropped: input.closeOut.frictionDropped,
  }),
});

function buildBuildInput(ctx: PhaseInputContext): BuildInput {
  return {
    acceptance: buildCriterionTexts(ctx.item),
    design: findLatestDesign(ctx.history),
    sentBack: findReviewSentBack(ctx),
    pullRequest: findPullRequestLink(ctx.pullRequests),
  };
}

// Only a latest review that asked for changes sends the build its findings: a build after a
// passed review, sent back by the owner, gets none.
function findReviewSentBack(ctx: PhaseInputContext): SentBack | null {
  const reading = findLatestCloseOut(ctx.history, 'review', reviewCloseOutSchema)?.reading;

  return reading?.status === 'blocked' && reading.why === 'open-findings'
    ? { from: 'review', head: reading.head, open: reading.open, answerHint: reading.answerHint }
    : null;
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

  // a failed build changes no item: the next build of the item cites its evidence again
  const isChanged =
    closeOut.result.kind === 'built' &&
    acceptance.some(
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
