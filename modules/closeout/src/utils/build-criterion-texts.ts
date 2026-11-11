import type { CriterionText, ItemView } from '@boxxy/model';

// The item's acceptance list as a phase input holds it: the evidence ids stay out.
export function buildCriterionTexts(item: ItemView): CriterionText[] {
  return item.acceptance.map((criterion) => ({ id: criterion.id, text: criterion.text }));
}
