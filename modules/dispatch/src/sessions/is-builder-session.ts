import type { ItemView, LoadedRules, PhaseName, SessionMode } from '@boxxy/model';
import { findRecipeName } from '@boxxy/model';

// Whether the item's kind and repo run the phase in this mode with a `session: builder` recipe,
// which wakes the build's kept session. Pure.
export function isBuilderSession(
  rules: LoadedRules,
  item: Pick<ItemView, 'kind' | 'repo'>,
  phase: PhaseName,
  mode: SessionMode,
): boolean {
  const name = findRecipeName(rules, item, phase, mode);

  return name !== undefined && rules.recipes.get(name)?.recipe.session === 'builder';
}
