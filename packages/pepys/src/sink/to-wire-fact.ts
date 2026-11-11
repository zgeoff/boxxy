import type { OutboxFact } from '@boxxy/model';
import type { FactBatchBody } from '@pepys/kit';

type WireFact = FactBatchBody['facts'][number];

// One outbox row as one fact of a batch. The event is the row's fact ID on every send, so a
// resend is a copy that pepys drops; ingest makes the fact ID `event:boxxy:<event>`. The store
// version goes into the payload here and nowhere else.
export function toWireFact(fact: OutboxFact): WireFact {
  return {
    type: fact.type,
    event: fact.factId,
    entity: fact.entity,
    actor: fact.actor,
    at: new Date(fact.at).toISOString(),
    payload: { ...toPayloadFields(fact.payload), storeVersion: fact.seq },
  };
}

type Payload = OutboxFact['payload'];

// Every catalog payload is an object; `Array.isArray` does not narrow a readonly list.
function toPayloadFields(payload: Payload): Readonly<Record<string, unknown>> {
  return isPayloadObject(payload) ? payload : {};
}

function isPayloadObject(
  payload: Payload,
): payload is Extract<Payload, Readonly<Record<string, unknown>>> {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload);
}
