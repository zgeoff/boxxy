import type { OutboxFact } from '@boxxy/model';

const encoder = new TextEncoder();

// An ISO 8601 time of a UTC instant has this one length, so the size needs no date function.
const isoTimePlaceholder = '2026-01-01T00:00:00.000Z';
const nullBytes = 4;
const storeVersionKey = '"storeVersion":';

// The UTF-8 bytes of the fact as the sink sends it: the row's fields, the time as ISO 8601, and
// the store version added to the payload. The payload is encoded once, and the added field is
// counted by its length.
export function measureWireBytes(fact: OutboxFact): number {
  const envelope = JSON.stringify({
    type: fact.type,
    event: fact.factId,
    entity: fact.entity,
    actor: fact.actor,
    at: isoTimePlaceholder,
    payload: null,
  });

  const payload = JSON.stringify(fact.payload);
  const separatorBytes = payload === '{}' ? 0 : 1;

  const addedBytes = payload.startsWith('{')
    ? separatorBytes + storeVersionKey.length + String(fact.seq).length
    : 0;

  return encoder.encode(envelope).length - nullBytes + encoder.encode(payload).length + addedBytes;
}
