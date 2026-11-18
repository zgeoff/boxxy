import type {
  CloseOutContext,
  CloseOutProblem,
  Effect,
  LiveCloseOut,
  LiveInput,
  PhaseInputContext,
} from '@boxxy/model';
import {
  brandSchemas,
  definePhase,
  findMergeCommit,
  liveCloseOutSchema,
  liveInputSchema,
  toJSONValue,
} from '@boxxy/model';
import { match } from 'ts-pattern';
import { buildSchemaParser } from '../build-schema-parser.ts';
import { buildCriterionTexts } from '../utils/build-criterion-texts.ts';
import { collectOpenItemProblems } from '../utils/collect-open-item-problems.ts';

const bugKind = brandSchemas.itemKindName.parse('bug');
const relatesToType = brandSchemas.relationTypeName.parse('relates-to');
const bugKey = 'bug';

// The agent that checks a shipped item against the deployed system. The step's `criteria.tagged`
// leaves the claim only the lines to check, and the input holds those.
export const live = definePhase({
  name: brandSchemas.phaseName.parse('live'),
  version: 1,
  worker: brandSchemas.workerKindName.parse('atc.session'),
  outcomes: ['confirmed', 'broken', 'blocked', 'abandoned'],
  needsAcceptance: true,
  input: (ctx) => toJSONValue(buildLiveInput(ctx)),
  closeOut: buildSchemaParser({
    schema: liveCloseOutSchema,
    toBody: (raw): LiveCloseOut => raw,
    check: collectLiveProblems,
  }),

  // A confirmed or broken live check did its job, so it succeeds. A blocked or abandoned one
  // checked nothing, and fails with the outcome as the failure.
  settle: (input) => ({
    ...match(input.closeOut)
      .with({ outcome: 'confirmed' }, { outcome: 'broken' }, () => ({
        state: 'succeeded' as const,
        failure: null,
      }))
      .with({ outcome: 'blocked' }, { outcome: 'abandoned' }, (ended) => ({
        state: 'failed' as const,
        failure: ended.outcome,
      }))
      .exhaustive(),
    outcome: input.closeOut.outcome,
    effects: collectLiveEffects(input.closeOut),
    frictionDropped: 0,
  }),
});

function buildLiveInput(ctx: PhaseInputContext): LiveInput {
  const commit = findMergeCommit(ctx.history, ctx.pullRequests);
  const merged = ctx.pullRequests.findLast((row) => row.mergeCommit === commit);
  const link = merged ?? ctx.pullRequests.at(-1);

  return {
    pullRequest:
      link === undefined ? null : { repo: link.repo, number: link.number, url: link.url },
    commit,
    shipped:
      commit === null ? null : (ctx.shipped.findLast((row) => row.commit === commit) ?? null),
    criteria: buildCriterionTexts(ctx.item),
  };
}

function collectLiveProblems(closeOut: LiveCloseOut, ctx: CloseOutContext): CloseOutProblem[] {
  if (closeOut.outcome === 'blocked' || closeOut.outcome === 'abandoned') {
    return [];
  }

  const known = new Set(liveInputSchema.parse(ctx.input).criteria.map((criterion) => criterion.id));

  const unknown = [
    ...new Set(
      closeOut.lines.map((line) => line.criterionId).filter((criterion) => !known.has(criterion)),
    ),
  ].map((criterion) => ({ kind: 'unknown-criterion' as const, criterion }));

  if (closeOut.outcome === 'confirmed') {
    return unknown;
  }

  return [
    ...unknown,
    ...(closeOut.lines.some((line) => !line.passed)
      ? []
      : [
          {
            kind: 'phase-rule' as const,
            message: 'a broken close-out names at least one failing line',
          },
        ]),
    ...(closeOut.bug.kind === bugKind
      ? []
      : [
          {
            kind: 'phase-rule' as const,
            message: 'the bug of a broken close-out has the kind bug',
          },
        ]),
    ...collectOpenItemProblems([closeOut.bug], ctx),
    ...(ctx.world.relationTypes.has(relatesToType)
      ? []
      : [
          {
            kind: 'refused-relation' as const,
            type: relatesToType,
            target: ctx.item.id,
            reason: 'unknown-type' as const,
          },
        ]),
  ];
}

// The bug files first, so the settle knows its ID when it links it to the checked item.
function collectLiveEffects(closeOut: LiveCloseOut): Effect[] {
  return closeOut.outcome === 'broken'
    ? [
        { kind: 'file-item', item: closeOut.bug, key: bugKey },
        {
          kind: 'add-relation',
          link: {
            type: relatesToType,
            from: { kind: 'open-item', key: bugKey },
            to: { kind: 'item' },
          },
        },
      ]
    : [];
}
