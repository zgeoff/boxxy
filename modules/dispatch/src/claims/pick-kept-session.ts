import type { AttemptRow, ItemView, KeptSession, PhaseName, Pipeline } from '@boxxy/model';

interface KeptSessionInput {
  readonly item: ItemView;

  // the item's attempts, oldest first
  readonly attempts: readonly AttemptRow[];
  readonly pipeline: Pipeline;

  // the phase of the new claim
  readonly phase: PhaseName;
}

// The item's kept session, when the claim came back to `phase` through an edge with
// `resume: true`; else null. Pure.
export function pickKeptSession(input: KeptSessionInput): KeptSession | null {
  const kept = input.item.keptSession;

  if (kept === null) {
    return null;
  }

  const latest = input.attempts
    .filter((attempt) => attempt.endedAt !== null && isCounted(attempt))
    .toSorted((first, second) => (first.endedAt ?? 0) - (second.endedAt ?? 0))
    .at(-1);

  const step = input.pipeline.steps.find((candidate) => candidate.phase === latest?.phase);

  const edge =
    latest?.outcome === null || latest === undefined ? undefined : step?.on[latest.outcome];

  return typeof edge === 'object' && 'to' in edge && edge.to === input.phase && edge.resume === true
    ? kept
    : null;
}

// the two failures that move no item
function isCounted(attempt: AttemptRow): boolean {
  return attempt.failure !== 'no-capacity' && attempt.failure !== 'usage-limit';
}
