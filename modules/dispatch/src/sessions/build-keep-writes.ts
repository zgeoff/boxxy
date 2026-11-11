import type { AttemptRow, Instant, ItemView, LoadedRules, RowWrite } from '@boxxy/model';
import { spawnRequestSchema } from '@boxxy/model';

interface KeepInput {
  // the attempt that settled `succeeded` with its session stopped
  readonly attempt: AttemptRow;
  readonly item: ItemView;
  readonly rules: LoadedRules;
  readonly now: Instant;
}

// The write that records the attempt's session as the item's kept session, when an edge of the
// item's pipeline comes back to the attempt's phase with `resume: true`; else none. Pure.
export function buildKeepWrites(input: KeepInput): RowWrite[] {
  const attempt = input.attempt;
  const item = input.item;

  if (attempt.atcSession === null) {
    return [];
  }

  const steps = input.rules.kinds.get(item.kind)?.pipeline.steps ?? [];

  const isResumeEdge = steps.some((step) =>
    Object.values(step.on).some(
      (edge) =>
        typeof edge === 'object' &&
        'to' in edge &&
        edge.to === attempt.phase &&
        edge.resume === true,
    ),
  );

  if (!isResumeEdge) {
    return [];
  }

  return [
    {
      op: 'update',
      table: 'items',
      key: { id: item.id },
      expect: { keptSession: item.keptSession },
      set: {
        keptSession: {
          atcSession: attempt.atcSession,
          target: spawnRequestSchema.parse(attempt.spawnRequest).target,
          attempt: attempt.id,
          keptAt: input.now,
          caller: attempt.caller,
        },
      },
    },
  ];
}
