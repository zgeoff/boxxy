import type { AttemptId } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';

const trailerPattern = /^Boxxy-Attempt:[ \t]*(?<attempt>\S+)[ \t]*$/gimu;

// The attempt IDs that the `Boxxy-Attempt` trailers of a commit message carry, in order. A
// value that is not an attempt ID is left out.
export function collectAttemptTrailers(message: string): AttemptId[] {
  const attempts: AttemptId[] = [];

  for (const match of message.matchAll(trailerPattern)) {
    const parsed = brandSchemas.attemptId.safeParse(match.groups?.['attempt']);

    if (parsed.success) {
      attempts.push(parsed.data);
    }
  }

  return attempts;
}
