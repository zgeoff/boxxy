import type { AttemptRow } from '@boxxy/model';
import type { z } from 'zod';

// Where the item's latest attempt of a phase that closed out stopped: what `pickReason` gives for
// its close-out, or null. An attempt that ended with no close-out, such as at its timeout, sent
// nothing to carry on from, so the one before it counts.
export function findStoppedReason<Body>(
  history: readonly AttemptRow[],
  phase: string,
  schema: z.ZodType<Body>,
  pickReason: (body: Body) => string | null,
): string | null {
  const latest = history
    .filter((row) => row.phase === phase)
    .map((row) => schema.safeParse(row.closeOut))
    .findLast((parsed) => parsed.success);

  return latest?.data === undefined ? null : pickReason(latest.data);
}
