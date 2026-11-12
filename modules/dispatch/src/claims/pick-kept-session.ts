import type { AttemptRow, ItemView, KeptPick, PhaseName, Pipeline } from '@boxxy/model';

interface KeptSessionInput {
  readonly item: ItemView;

  // the item's attempts, oldest first
  readonly attempts: readonly AttemptRow[];
  readonly pipeline: Pipeline;

  // the phase of the new claim
  readonly phase: PhaseName;

  // the claim's recipe has `session: builder`
  readonly isBuilderSession: boolean;
}

// Whether the claim wakes the item's kept session. It wants one when its recipe has
// `session: builder`, or when it came back to `phase` through an edge with `resume: true`. Pure.
export function pickKeptSession(input: KeptSessionInput): KeptPick {
  if (!input.isBuilderSession && !isResumeClaim(input)) {
    return { kind: 'none' };
  }

  const kept = input.item.keptSession;

  return kept === null ? { kind: 'gone' } : { kind: 'kept', session: kept };
}

function isResumeClaim(input: KeptSessionInput): boolean {
  const latest = input.attempts
    .filter((attempt) => attempt.endedAt !== null && isCounted(attempt))
    .toSorted((first, second) => (first.endedAt ?? 0) - (second.endedAt ?? 0))
    .at(-1);

  const step = input.pipeline.steps.find((candidate) => candidate.phase === latest?.phase);

  const edge =
    latest?.outcome === null || latest === undefined ? undefined : step?.on[latest.outcome];

  return (
    typeof edge === 'object' && 'to' in edge && edge.to === input.phase && edge.resume === true
  );
}

// the two failures that move no item
function isCounted(attempt: AttemptRow): boolean {
  return attempt.failure !== 'no-capacity' && attempt.failure !== 'usage-limit';
}
