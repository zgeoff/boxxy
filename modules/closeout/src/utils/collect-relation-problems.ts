import type { CloseOutContext, CloseOutProblem, RelationDraft } from '@boxxy/model';
import { getRelationEnds } from '@boxxy/model';

// `implied` holds the relations a result names already, such as a duplicate's `duplicate-of`. They
// count for the unknown items and the repeats only, so a duplicate of itself is one phase rule.
export function collectRelationProblems(
  relations: readonly RelationDraft[],
  implied: readonly RelationDraft[],
  ctx: CloseOutContext,
): CloseOutProblem[] {
  const named = [...implied, ...relations];

  const others = named
    .map((relation) => getRelationEnds(relation, ctx.item.id).other)
    .filter((item) => item !== ctx.item.id);

  return [
    ...[...new Set(others)]
      .filter((item) => !ctx.world.items.has(item))
      .map((item) => ({ kind: 'unknown-item' as const, item })),
    ...relations.flatMap((relation) => collectRefusals(relation, ctx)),
    ...collectRepeats(named, ctx),
  ];
}

// `target` of the problem is the other end, whichever way the draft points.
function collectRefusals(relation: RelationDraft, ctx: CloseOutContext): CloseOutProblem[] {
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
// target once.
function collectRepeats(named: readonly RelationDraft[], ctx: CloseOutContext): CloseOutProblem[] {
  const keyed = named.map((relation) => {
    const ends = getRelationEnds(relation, ctx.item.id);

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
