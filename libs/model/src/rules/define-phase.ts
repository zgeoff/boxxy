import type { JsonValue } from '@boxxy/content-hash';
import type { PhaseKind } from './types.ts';

// Checks a phase kind against its own body, input and outcome list, then gives it the erased
// type that the registry holds.
export function definePhase<
  Body,
  Input extends JsonValue,
  const Outcomes extends readonly string[],
>(phase: PhaseKind<Body, Input, Outcomes>): PhaseKind {
  return phase;
}
