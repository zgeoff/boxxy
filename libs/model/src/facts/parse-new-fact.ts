import type { z } from 'zod';
import type { AnyNewFact } from './types.ts';
import { workFactSchemas } from './work-fact-schemas.ts';

// The store's check of each fact before the change writes it: a payload that its type's schema
// refuses throws, and the change writes nothing.
export function parseNewFact(fact: AnyNewFact): AnyNewFact {
  const schema: z.ZodType = workFactSchemas[fact.type];
  const parsed = schema.safeParse(fact.payload);

  if (!parsed.success) {
    throw new Error(`the payload of a ${fact.type} fact is not valid`, { cause: parsed.error });
  }

  return fact;
}
