import type { NewFact, WorkFacts } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import type { ServerDeps } from '../types.ts';

// A fact of the runner's pause switch. Its entity is the runner, because it names no item.
export function buildRunnerFact<Type extends 'boxxy.runner.paused' | 'boxxy.runner.resumed'>(
  deps: ServerDeps,
  type: Type,
  payload: WorkFacts[Type],
): NewFact<Type> {
  return {
    id: brandSchemas.factId.parse(deps.newId()),
    type,
    entity: `boxxy:runner:${deps.runner}`,
    actor: 'boxxy:owner:local',
    payload,
  };
}
