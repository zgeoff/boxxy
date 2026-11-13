import type { JsonValue } from '@boxxy/content-hash';
import type { OutboxFact } from '../facts/types.ts';
import type { ItemRevision } from './types.ts';

// The edit fact keeps the design mode under `fields`, so a revision names the field inside it.
export function buildItemRevision(fact: OutboxFact): ItemRevision {
  const payload = toRecord(fact.payload);

  const changed = Object.keys(payload)
    .filter((key) => key !== 'byAttempt')
    .flatMap((key) => (key === 'fields' ? Object.keys(toRecord(payload[key] ?? null)) : [key]));

  return { seq: fact.seq, at: fact.at, actor: fact.actor, changed: changed.toSorted() };
}

type JsonRecord = Readonly<Record<string, JsonValue>>;

function toRecord(value: JsonValue): JsonRecord {
  return isJsonRecord(value) ? value : {};
}

function isJsonRecord(value: JsonValue): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
