import type {
  AttemptRow,
  CloseOutContext,
  CommitSha,
  Instant,
  LoadedRules,
  NoHeadCause,
  StoreTx,
} from '@boxxy/model';
import invariant from 'tiny-invariant';
import { filterTaggedCriteria } from '../claims/filter-tagged-criteria.ts';

// the time of the read, and the head of the item's pull request when the call read it
interface CloseOutReadAt {
  readonly now: Instant;
  readonly head: CommitSha | null;
  readonly noHeadCause?: NoHeadCause | null;
}

// What a phase kind's close-out parser reads about the attempt's item and the world around it.
export async function readCloseOutContext(
  tx: StoreTx,
  attempt: AttemptRow,
  rules: LoadedRules,
  at: CloseOutReadAt,
): Promise<CloseOutContext> {
  const now = at.now;

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
    head: at.head,
    ...(at.noHeadCause ? { noHeadCause: at.noHeadCause } : {}),
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
