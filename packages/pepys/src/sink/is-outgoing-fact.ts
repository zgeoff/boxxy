import type { FactBatchBody, OutgoingFact } from '@pepys/kit';
import type { z } from 'zod';
import type { boxxySource } from '../boxxy-source.ts';
import { runnerFamily, workFamily } from '../boxxy-source.ts';

type WireFact = FactBatchBody['facts'][number];

// The check that ingest makes of each fact of a batch: a type of a family of the source, an entity
// of that family's kind, and a payload that the type's schema accepts.
export function isOutgoingFact(fact: WireFact): fact is OutgoingFact<typeof boxxySource> {
  return isFamilyFact(workFamily, fact) || isFamilyFact(runnerFamily, fact);
}

interface FamilyShape {
  readonly entityKind: string;
  readonly types: Readonly<Record<string, z.ZodType>>;
}

function isFamilyFact(family: FamilyShape, fact: WireFact): boolean {
  return (
    Object.hasOwn(family.types, fact.type) &&
    fact.entity.startsWith(`${family.entityKind}:`) &&
    family.types[fact.type]?.safeParse(fact.payload).success === true
  );
}
