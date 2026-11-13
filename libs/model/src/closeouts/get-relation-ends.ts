import type { ItemId } from '../types.ts';
import type { RelationDraft } from './types.ts';

export interface RelationEnds {
  readonly source: ItemId;
  readonly target: ItemId;

  // the end that is not the attempt's item
  readonly other: ItemId;
}

// The ends of a relation that a close-out of `item` asks for.
export function getRelationEnds(draft: RelationDraft, item: ItemId): RelationEnds {
  return 'source' in draft
    ? { source: draft.source, target: item, other: draft.source }
    : { source: item, target: draft.target, other: draft.target };
}
