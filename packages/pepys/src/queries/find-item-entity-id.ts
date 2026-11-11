import { buildEntityID, parseEntityID } from '@pepys/kit';
import type { EntityID } from '@pepys/kit';

// The item of a query's input as an entity ID. undefined: the text names no boxxy item, so the
// query answers as for an item with no row.
export function findItemEntityID(text: string): EntityID | undefined {
  const parsed = parseEntityID(text);

  if (!parsed.ok || parsed.value.source !== 'boxxy' || parsed.value.kind !== 'item') {
    return undefined;
  }

  const built = buildEntityID(parsed.value);

  return built.ok ? built.value : undefined;
}
