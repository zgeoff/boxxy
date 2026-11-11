import type { AttemptRow } from '@boxxy/model';
import type { z } from 'zod';

// The close-out of the item's latest succeeded attempt of a phase, read through the schema of
// its body, so a stored body of another shape reads as none.
export function findLatestCloseOut<Body>(
  history: readonly AttemptRow[],
  phase: string,
  schema: z.ZodType<Body>,
): Body | null {
  const attempt = history.findLast((row) => row.phase === phase && row.state === 'succeeded');

  if (attempt === undefined) {
    return null;
  }

  const parsed = schema.safeParse(attempt.closeOut);

  return parsed.success ? parsed.data : null;
}
