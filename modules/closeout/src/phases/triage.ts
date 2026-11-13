import type {
  AcceptanceInput,
  CloseOutContext,
  CloseOutProblem,
  Effect,
  TriageCloseOut,
} from '@boxxy/model';
import { brandSchemas, definePhase, toJSONValue, triageCloseOutSchema } from '@boxxy/model';
import { match } from 'ts-pattern';
import type { z } from 'zod';
import { buildSchemaParser } from '../build-schema-parser.ts';
import { buildCriteria } from '../utils/build-criteria.ts';
import { buildCriterionTexts } from '../utils/build-criterion-texts.ts';

const triageBodySchema = triageCloseOutSchema.omit({ frictionDropped: true });

export const triage = definePhase({
  name: brandSchemas.phaseName.parse('triage'),
  version: 1,
  worker: brandSchemas.workerKindName.parse('atc.session'),
  outcomes: ['accepted', 'duplicate', 'declined'],
  needsAcceptance: false,
  input: (ctx) =>
    toJSONValue({ acceptance: buildCriterionTexts(ctx.item) } satisfies AcceptanceInput),
  closeOut: buildSchemaParser({
    schema: triageBodySchema,
    toBody: (raw: z.output<typeof triageBodySchema>, frictionDropped): TriageCloseOut => ({
      ...raw,
      frictionDropped,
    }),
    check: collectTriageProblems,
  }),
  settle: (input) => ({
    state: 'succeeded',
    failure: null,
    outcome: input.closeOut.result.kind,
    effects: collectTriageEffects(input.closeOut),
    frictionDropped: input.closeOut.frictionDropped,
  }),
});

function collectTriageProblems(closeOut: TriageCloseOut, ctx: CloseOutContext): CloseOutProblem[] {
  const acceptance = closeOut.set?.acceptance ?? ctx.item.acceptance;
  const kind = closeOut.set?.kind;
  const duplicateOf = closeOut.result.kind === 'duplicate' ? [closeOut.result.of] : [];

  const named = [...duplicateOf, ...closeOut.relations.map((relation) => relation.target)].filter(
    (item) => item !== ctx.item.id,
  );

  return [
    ...(closeOut.result.kind === 'accepted' && acceptance.length === 0
      ? [{ kind: 'no-acceptance' as const }]
      : []),
    ...(kind !== undefined && !ctx.world.kinds.has(kind)
      ? [{ kind: 'unknown-kind' as const, itemKind: kind }]
      : []),
    ...[...new Set(named)]
      .filter((item) => !ctx.world.items.has(item))
      .map((item) => ({ kind: 'unknown-item' as const, item })),
    ...duplicateOf
      .filter((item) => item === ctx.item.id)
      .map(() => ({
        kind: 'phase-rule' as const,
        message: 'an item is not a duplicate of itself',
      })),
    ...closeOut.relations.flatMap((relation) => collectRelationProblems(relation, ctx)),
    ...collectRepeatedRelations(closeOut, duplicateOf),
  ];
}

function collectRelationProblems(
  relation: TriageCloseOut['relations'][number],
  ctx: CloseOutContext,
): CloseOutProblem[] {
  const refused = (reason: 'unknown-type' | 'self'): CloseOutProblem => ({
    kind: 'refused-relation',
    type: relation.type,
    target: relation.target,
    reason,
  });

  return [
    ...(ctx.world.relationTypes.has(relation.type) ? [] : [refused('unknown-type')]),
    ...(relation.target === ctx.item.id ? [refused('self')] : []),
  ];
}

// Each relation is one row of the store, so a close-out names each pair of type and target once.
// A duplicate's `of` names the `duplicate-of` relation already.
function collectRepeatedRelations(
  closeOut: TriageCloseOut,
  duplicateOf: readonly TriageCloseOut['relations'][number]['target'][],
): CloseOutProblem[] {
  const named = [
    ...duplicateOf.map((target) => ({ type: 'duplicate-of', target })),
    ...closeOut.relations,
  ];

  return named.flatMap((relation, index) =>
    named
      .slice(0, index)
      .some((earlier) => earlier.type === relation.type && earlier.target === relation.target)
      ? [
          {
            kind: 'phase-rule' as const,
            message: `the close-out names ${relation.type} ${relation.target} more than once`,
          },
        ]
      : [],
  );
}

// A duplicate closes with `of`, which adds the `duplicate-of` relation in the same change.
function collectTriageEffects(closeOut: TriageCloseOut): Effect[] {
  const set = closeOut.set ?? {};

  return [
    ...(set.kind === undefined ? [] : [{ kind: 'set-kind' as const, itemKind: set.kind }]),
    ...(set.designMode === undefined
      ? []
      : [{ kind: 'set-field' as const, field: 'designMode' as const, value: set.designMode }]),
    ...(set.acceptance === undefined
      ? []
      : [{ kind: 'set-acceptance' as const, criteria: buildCriteria(set.acceptance) }]),
    ...(set.body === undefined ? [] : [{ kind: 'set-body' as const, body: set.body }]),
    ...closeOut.relations.map((relation) => ({ kind: 'add-relation' as const, relation })),
    ...buildCloseEffects(closeOut.result),
    ...closeOut.friction.map((friction) => ({ kind: 'record-proposal' as const, friction })),
  ];
}

function buildCloseEffects(result: TriageCloseOut['result']): Effect[] {
  return match(result)
    .returnType<Effect[]>()
    .with({ kind: 'accepted' }, () => [])
    .with({ kind: 'duplicate' }, (duplicate) => [
      { kind: 'close-item', reason: 'duplicate', of: duplicate.of },
    ])
    .with({ kind: 'declined' }, (declined) => [
      { kind: 'close-item', reason: declined.reason, of: null },
    ])
    .exhaustive();
}
