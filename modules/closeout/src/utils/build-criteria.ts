import type { Criterion, CriterionDraft } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';

// The list replaces the item's list whole, so its criteria are numbered from `a1`.
export function buildCriteria(acceptance: readonly CriterionDraft[]): Criterion[] {
  return acceptance.map((criterion, index) => ({
    id: brandSchemas.criterionId.parse(`a${index + 1}`),
    text: criterion.text,
    evidence: [],
    ...(criterion.tags === undefined ? {} : { tags: criterion.tags }),
  }));
}
