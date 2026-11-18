import type { AttemptRow, CloseOutContext, Instant, LoadedRules, StoreTx } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { filterTaggedCriteria } from '../claims/filter-tagged-criteria.ts';

// What a phase kind's close-out parser reads about the attempt's item and the world around it.
export async function readCloseOutContext(
  tx: StoreTx,
  attempt: AttemptRow,
  rules: LoadedRules,
  now: Instant,
): Promise<CloseOutContext> {
  const item = await tx.readItem(attempt.item, now, rules);

  invariant(item !== null, `an attempt's item is stored: ${attempt.item}`);

  const step = rules.kinds
    .get(item.kind)
    ?.pipeline.steps.find((each) => each.phase === attempt.phase);

  const items = await tx.listItems({}, now, rules);

  return {
    // the attempt saw only the lines its step's `criteria` gate tagged, so it answers for those
    item: filterTaggedCriteria(item, step),
    attempt: attempt.id,
    evidence: await tx.listEvidence(attempt.id),
    world: buildWorld(
      rules,
      items.map((each) => each.id),
    ),
    input: attempt.input,
  };
}

function buildWorld(rules: LoadedRules, items: readonly CloseOutContext['item']['id'][]) {
  return {
    items: new Set(items),
    kinds: new Set(rules.kinds.keys()),
    relationTypes: new Set(rules.relationTypes.keys()),
    criterionTags: new Set(rules.criterionTags),
  };
}
