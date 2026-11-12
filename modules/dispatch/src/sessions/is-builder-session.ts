import type { KindRules, LoadedRules, PhaseName, SessionMode } from '@boxxy/model';
import { findRecipeName } from '../claims/find-recipe-name.ts';

// Whether the kind runs the phase in this mode with a `session: builder` recipe, which wakes the
// build's kept session. Pure.
export function isBuilderSession(
  rules: LoadedRules,
  kind: KindRules,
  phase: PhaseName,
  mode: SessionMode,
): boolean {
  const name = findRecipeName(kind, phase, mode);

  return name !== undefined && rules.recipes.get(name)?.recipe.session === 'builder';
}
