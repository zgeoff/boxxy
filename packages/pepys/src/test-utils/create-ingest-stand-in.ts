import type { FactBatchSend, WireFact } from '../kit/types.ts';
import { wireFactSchemas } from '../wire-fact-schemas.ts';

export interface IngestStandIn {
  // answers as the kit's sender does after ingest's receive route
  readonly send: FactBatchSend;

  // the events of the stored facts, in arrival order, a copy counted once
  readStored: () => Promise<readonly string[]>;
}

// Ingest's answers to a fact batch, in memory: more than 100 facts is refused with 413 before any
// is sent; a fact of an unknown type, or whose payload its family schema refuses, refuses the
// batch whole with 422; any other batch is stored whole, and a copy of an event is dropped.
export function createIngestStandIn(): IngestStandIn {
  const stored: string[] = [];

  return {
    send: (facts) => {
      if (facts.length > 100) {
        return Promise.resolve({
          ok: false,
          failure: { kind: 'refused', status: 413, reason: 'over the fact limit' },
        });
      }

      const bad = facts.find((fact) => !isFamilyFact(fact));

      if (bad !== undefined) {
        return Promise.resolve({
          ok: false,
          failure: { kind: 'refused', status: 422, reason: `the fact ${bad.event} is not valid` },
        });
      }

      const fresh = facts.map((fact) => fact.event).filter((event) => !stored.includes(event));

      stored.push(...fresh);

      return Promise.resolve({ ok: true, value: { stored: facts.length } });
    },
    readStored: () => Promise.resolve([...stored]),
  };
}

function isFamilyFact(fact: WireFact): boolean {
  const schemas: Readonly<Record<string, { safeParse: (value: unknown) => { success: boolean } }>> =
    wireFactSchemas;

  const schema = schemas[fact.type];

  return schema !== undefined && schema.safeParse(fact.payload).success;
}
