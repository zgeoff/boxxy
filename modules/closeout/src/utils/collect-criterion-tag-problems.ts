import type { CloseOutContext, CloseOutProblem, CriterionDraft } from '@boxxy/model';

// One problem for each distinct tag of the list that the rules file does not list.
export function collectCriterionTagProblems(
  acceptance: readonly CriterionDraft[],
  ctx: CloseOutContext,
): CloseOutProblem[] {
  const unknown = acceptance
    .flatMap((criterion) => criterion.tags ?? [])
    .filter((tag) => !ctx.world.criterionTags.has(tag));

  return [...new Set(unknown)].map((tag) => ({ kind: 'unknown-criterion-tag' as const, tag }));
}
