import type { AttemptRow, Instant, ItemView, LoadedRules, RowWrite } from '@boxxy/model';
import { buildPhase, spawnRequestSchema } from '@boxxy/model';
import { isBuilderSession } from './is-builder-session.ts';

interface KeepInput {
  // the attempt that settled `succeeded` with its session stopped
  readonly attempt: AttemptRow;
  readonly item: ItemView;
  readonly rules: LoadedRules;
  readonly now: Instant;
}

// The write that keeps the attempt's session on the item: for a phase that an edge resumes, a
// build whose kind grades with a `session: builder` recipe, and that grader. Pure.
export function buildKeepWrites(input: KeepInput): RowWrite[] {
  const attempt = input.attempt;
  const item = input.item;
  const kind = input.rules.kinds.get(item.kind);

  if (attempt.atcSession === null || kind === undefined) {
    return [];
  }

  const isResumeEdge = kind.pipeline.steps.some((step) =>
    Object.values(step.on).some(
      (edge) =>
        typeof edge === 'object' &&
        'to' in edge &&
        edge.to === attempt.phase &&
        edge.resume === true,
    ),
  );

  const hasBuilderGrader = Object.values(kind.recipes).some(
    (name) => input.rules.recipes.get(name)?.recipe.session === 'builder',
  );

  const isKept =
    isResumeEdge ||
    (attempt.phase === buildPhase && hasBuilderGrader) ||
    isBuilderSession(input.rules, kind, attempt.phase, attempt.mode);

  if (!isKept) {
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
