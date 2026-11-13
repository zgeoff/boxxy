import type { AttemptRow, PhaseName, Recipe } from '@boxxy/model';

// The template that a claim renders. A rework round is an attempt of a phase that already
// succeeded once for the item: a review, a verify or a merge sent the work back, or the owner
// retried it. Its recipe's `reworkPrompt` replaces `prompt`, when the recipe has one.
export function pickPromptPath(
  recipe: Recipe,
  history: readonly AttemptRow[],
  phase: PhaseName,
): string {
  const isRework = history.some((row) => row.phase === phase && row.state === 'succeeded');

  return isRework && recipe.reworkPrompt !== undefined ? recipe.reworkPrompt : recipe.prompt;
}
