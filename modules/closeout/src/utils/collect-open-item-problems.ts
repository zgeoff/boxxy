import type { CloseOutContext, CloseOutProblem, OpenItem } from '@boxxy/model';

// An open item files as an item of its kind, so a kind the rules lack is refused, once per kind.
export function collectOpenItemProblems(
  openItems: readonly OpenItem[],
  ctx: CloseOutContext,
): CloseOutProblem[] {
  const kinds = new Set(openItems.map((openItem) => openItem.kind));

  return [...kinds]
    .filter((kind) => !ctx.world.kinds.has(kind))
    .map((kind) => ({ kind: 'unknown-kind', itemKind: kind }));
}
