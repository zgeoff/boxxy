import { buildEntityID, parseEntityID } from '@pepys/kit';
import type { EntityID } from '@pepys/kit';

// A row that a test writes takes its entity ID columns as the kit's entity ID type.
export function toEntityID(text: string): EntityID {
  const parsed = parseEntityID(text);
  const built = parsed.ok ? buildEntityID(parsed.value) : parsed;

  if (!built.ok) {
    throw new Error(`${text} is no entity ID: ${built.failure.reason}`);
  }

  return built.value;
}
