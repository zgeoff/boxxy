import type { AttemptRow, PhaseName } from '@boxxy/model';

// The number after the highest that the item's attempts of the phase hold. A count would give a
// number that a stored attempt holds when a gap stands in the numbers.
export function pickNextNumber(
  attempts: readonly Pick<AttemptRow, 'phase' | 'number'>[],
  phase: PhaseName,
): number {
  const numbers = attempts.filter((row) => row.phase === phase).map((row) => row.number);

  return Math.max(0, ...numbers) + 1;
}
