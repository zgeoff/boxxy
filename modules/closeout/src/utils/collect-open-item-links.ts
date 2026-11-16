import type { DesignOpenItem, LinkEnd, OpenItemLink } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { getOpenItemRef } from './get-open-item-ref.ts';

const blocksType = brandSchemas.relationTypeName.parse('blocks');

// The `blocks` links that the open items of a design set, each once, though `a.blocks: [b]` and
// `b.blockedBy: [a]` both name it.
export function collectOpenItemLinks(openItems: readonly DesignOpenItem[]): OpenItemLink[] {
  const pairs = openItems.flatMap((openItem, index) => {
    const own = getOpenItemRef(openItem, index);

    return [
      ...(openItem.blocks ?? []).map((ref) => [own, ref] as const),
      ...(openItem.blockedBy ?? []).map((ref) => [ref, own] as const),
    ];
  });

  const seen = new Set<string>();

  return pairs.flatMap(([from, to]) => {
    const pairKey = JSON.stringify([from, to]);

    if (seen.has(pairKey)) {
      return [];
    }

    seen.add(pairKey);

    return [{ type: blocksType, from: toLinkEnd(from), to: toLinkEnd(to) }];
  });
}

function toLinkEnd(ref: string): LinkEnd {
  return ref === 'item' ? { kind: 'item' } : { kind: 'open-item', key: ref };
}
