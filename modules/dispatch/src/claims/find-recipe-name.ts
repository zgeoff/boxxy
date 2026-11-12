import type { KindRules, PhaseName, RecipeName, SessionMode } from '@boxxy/model';

// The recipe that a kind runs a phase with: the attended recipe for an attended session when the
// kind names one, else the phase's own. Undefined when the kind names neither.
export function findRecipeName(
  kind: KindRules,
  phase: PhaseName,
  mode: SessionMode,
): RecipeName | undefined {
  return (
    (mode === 'attended' ? kind.recipes[`${phase}/attended`] : undefined) ?? kind.recipes[phase]
  );
}
