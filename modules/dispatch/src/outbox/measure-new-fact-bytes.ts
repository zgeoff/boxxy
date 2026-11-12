import { brandSchemas, toJSONValue } from '@boxxy/model';
import type { AnyNewFact, OutboxFact } from '@boxxy/model';
import { measureWireBytes } from './measure-wire-bytes.ts';

// The store version is not known before the write, so the count takes the longest one a number
// holds, and a fact that passes here never comes out larger on the wire.
const longestSeq = Number.MAX_SAFE_INTEGER;

// The wire bytes of a fact that is not stored yet, measured as the outbox measures a stored one.
export function measureNewFactBytes(fact: AnyNewFact): number {
  const row: OutboxFact = {
    seq: longestSeq,
    factId: fact.id,
    type: fact.type,
    entity: fact.entity,
    actor: fact.actor,
    at: brandSchemas.instant.parse(0),
    payload: toJSONValue(fact.payload),
    sentAt: null,
    parkedAt: null,
    parkedReason: null,
  };

  return measureWireBytes(row);
}
