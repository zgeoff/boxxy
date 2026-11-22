import type { z } from 'zod';
import { refineEvidenceHead } from './refine-evidence-head.ts';
import type { AnyNewFact } from './types.ts';
import { workFactSchemas } from './work-fact-schemas.ts';

const checkedSchemas: Record<keyof typeof workFactSchemas, z.ZodType> = {
  ...workFactSchemas,
  'boxxy.evidence.recorded': refineEvidenceHead(workFactSchemas['boxxy.evidence.recorded']),
};

// The store's check of each fact before the change writes it: a payload that its type's schema
// refuses throws, and the change writes nothing.
export function parseNewFact(fact: AnyNewFact): AnyNewFact {
  const schema: z.ZodType = checkedSchemas[fact.type];
  const parsed = schema.safeParse(fact.payload);

  if (!parsed.success) {
    throw new Error(`the payload of a ${fact.type} fact is not valid`, { cause: parsed.error });
  }

  return fact;
}
