import type { z } from 'zod';
import type { CommitSha, EvidenceKind } from '../types.ts';

interface EvidenceHeadFields {
  readonly kind: EvidenceKind;
  readonly head?: CommitSha;
}

// The base schema stays a plain object, because zod can't extend a refined one and the pepys
// wire schema adds `storeVersion` with `.extend`. Apply this after any `.extend`.
export function refineEvidenceHead<S extends z.ZodType<EvidenceHeadFields>>(schema: S): S {
  return schema.superRefine((fact, ctx) => {
    const isChecked = fact.kind === 'check' || fact.kind === 'verdict';

    if (isChecked && fact.head === undefined) {
      ctx.addIssue({ code: 'custom', path: ['head'], message: `a ${fact.kind} fact needs a head` });
    }

    if (!isChecked && fact.head !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['head'], message: `a ${fact.kind} fact has no head` });
    }
  });
}
