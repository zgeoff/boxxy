import type { ItemView, PipelineStep } from '@boxxy/model';

// The item as a step with a `criteria` gate sees it: only the lines that carry the tag. A step
// with no gate sees the item whole.
export function filterTaggedCriteria<Item extends ItemView>(
  item: Item,
  step: PipelineStep | undefined,
): Item {
  const tag = step?.criteria?.tagged;

  if (tag === undefined) {
    return item;
  }

  return {
    ...item,
    acceptance: item.acceptance.filter((line) => line.tags?.includes(tag) === true),
  };
}
