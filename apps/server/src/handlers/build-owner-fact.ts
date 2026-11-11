import type { ItemId, NewFact, WorkFacts } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import type { ServerDeps } from '../types.ts';

// A fact of the owner's path. Its entity is the item it names (the entity rule of the fact
// catalog).
export function buildOwnerFact<Type extends keyof WorkFacts>(
  deps: ServerDeps,
  item: ItemId,
  type: Type,
  payload: WorkFacts[Type],
): NewFact<Type> {
  return {
    id: brandSchemas.factId.parse(deps.newId()),
    type,
    entity: `boxxy:item:${item}`,
    actor: 'boxxy:owner:local',
    payload,
  };
}
