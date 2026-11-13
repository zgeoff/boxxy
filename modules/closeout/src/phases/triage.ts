import type {
  AcceptanceInput,
  CloseOutContext,
  CloseOutProblem,
  Effect,
  ItemId,
  RelationDraft,
  TriageCloseOut,
} from '@boxxy/model';
import {
  brandSchemas,
  definePhase,
  getRelationEnds,
  toJSONValue,
  triageCloseOutSchema,
} from '@boxxy/model';
import { match } from 'ts-pattern';
import type { z } from 'zod';
import { buildSchemaParser } from '../build-schema-parser.ts';
import { buildCriteria } from '../utils/build-criteria.ts';
import { buildCriterionTexts } from '../utils/build-criterion-texts.ts';
import { collectOpenItemProblems } from '../utils/collect-open-item-problems.ts';
import { findStoppedReason } from '../utils/find-stopped-reason.ts';

const triageBodySchema = triageCloseOutSchema.omit({ frictionDropped: true });

export const triage = definePhase({
  name: brandSchemas.phaseName.parse('triage'),
  version: 1,
  worker: brandSchemas.workerKindName.parse('atc.session'),
  outcomes: ['accepted', 'duplicate', 'declined', 'needs-owner', 'split'],
  needsAcceptance: false,
  input: (ctx) =>
    toJSONValue({
      acceptance: buildCriterionTexts(ctx.item),
      stopped: findStoppedReason(ctx.history, 'triage', triageCloseOutSchema, (body) =>
        body.result.kind === 'needs-owner' ? body.result.question : null,
      ),
    } satisfies AcceptanceInput),
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
  const parts = closeOut.result.kind === 'split' ? closeOut.result.openItems : [];

  const named = [
    ...duplicateOf,
    ...closeOut.relations.map((relation) => getRelationEnds(relation, ctx.item.id).other),
  ].filter((item) => item !== ctx.item.id);

  return [
    ...(closeOut.result.kind === 'accepted' && acceptance.length === 0
      ? [{ kind: 'no-acceptance' as const }]
      : []),
    ...(kind !== undefined && !ctx.world.kinds.has(kind)
      ? [{ kind: 'unknown-kind' as const, itemKind: kind }]
      : []),
    ...collectOpenItemProblems(parts, ctx),
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
    ...collectRepeatedRelations(closeOut, duplicateOf, ctx.item.id),
  ];
}

// `target` of the problem is the other end, whichever way the draft points.
function collectRelationProblems(relation: RelationDraft, ctx: CloseOutContext): CloseOutProblem[] {
  const other = getRelationEnds(relation, ctx.item.id).other;

  const refused = (reason: 'unknown-type' | 'self'): CloseOutProblem => ({
    kind: 'refused-relation',
    type: relation.type,
    target: other,
    reason,
  });

  return [
    ...(ctx.world.relationTypes.has(relation.type) ? [] : [refused('unknown-type')]),
    ...(other === ctx.item.id ? [refused('self')] : []),
  ];
}

// Each relation is one row of the store, so a close-out names each relation of a type, source and
// target once. A duplicate's `of` names the `duplicate-of` relation already.
function collectRepeatedRelations(
  closeOut: TriageCloseOut,
  duplicateOf: readonly ItemId[],
  item: ItemId,
): CloseOutProblem[] {
  const named: RelationDraft[] = [
    ...duplicateOf.map((target) => ({
      type: brandSchemas.relationTypeName.parse('duplicate-of'),
      target,
    })),
    ...closeOut.relations,
  ];

  const keyed = named.map((relation) => {
    const ends = getRelationEnds(relation, item);

    return { relation, key: JSON.stringify([relation.type, ends.source, ends.target]) };
  });

  return keyed.flatMap((entry, index) =>
    keyed.slice(0, index).some((earlier) => earlier.key === entry.key)
      ? [
          {
            kind: 'phase-rule' as const,
            message: `the close-out names ${formatRelationDraft(entry.relation)} more than once`,
          },
        ]
      : [],
  );
}

function formatRelationDraft(relation: RelationDraft): string {
  return 'source' in relation
    ? `${relation.type} from ${relation.source}`
    : `${relation.type} ${relation.target}`;
}

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
    ...buildResultEffects(closeOut.result),
    ...closeOut.friction.map((friction) => ({ kind: 'record-proposal' as const, friction })),
  ];
}

// A duplicate closes with `of`, which adds the `duplicate-of` relation in the same change. A split
// files its parts and closes the item; a hold edge withholds the close, and the parts still file.
function buildResultEffects(result: TriageCloseOut['result']): Effect[] {
  return match(result)
    .returnType<Effect[]>()
    .with({ kind: 'accepted' }, { kind: 'needs-owner' }, () => [])
    .with({ kind: 'split' }, (split) => [
      ...split.openItems.map((openItem) => ({ kind: 'file-item' as const, item: openItem })),
      { kind: 'close-item' as const, reason: 'split', of: null },
    ])
    .with({ kind: 'duplicate' }, (duplicate) => [
      { kind: 'close-item', reason: 'duplicate', of: duplicate.of },
    ])
    .with({ kind: 'declined' }, (declined) => [
      { kind: 'close-item', reason: declined.reason, of: null },
    ])
    .exhaustive();
}
