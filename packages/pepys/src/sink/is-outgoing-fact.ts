import type { FactBatchBody, OutgoingFact } from '@pepys/kit';
import type { boxxySource } from '../boxxy-source.ts';
import { workFamily } from '../boxxy-source.ts';

// The check that ingest makes of each fact of a batch: a type of the family, an entity of the
// family's kind, and a payload that the type's schema accepts.
export function isOutgoingFact(
  fact: FactBatchBody['facts'][number],
): fact is OutgoingFact<typeof boxxySource> {
  return (
    isFamilyType(fact.type) &&
    fact.entity.startsWith(`${workFamily.entityKind}:`) &&
    workFamily.types[fact.type].safeParse(fact.payload).success
  );
}

function isFamilyType(type: string): type is keyof typeof workFamily.types {
  return Object.hasOwn(workFamily.types, type);
}
