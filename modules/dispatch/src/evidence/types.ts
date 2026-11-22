import type {
  CheckedEvidenceRefusal,
  ClaimStore,
  FactId,
  Forge,
  Instant,
  ItemRules,
  NewId,
  Verifier,
} from '@boxxy/model';
import type { CallRef } from '../closeouts/types.ts';

// What a session records. A `check` names a CI check and a `verdict` a verify feature; neither
// carries text, because the server reads the result itself.
export type EvidenceDraft =
  | {
      readonly kind: 'test' | 'ci-run' | 'live-check';
      readonly ref: string;
      readonly observed: string | null;
    }
  | { readonly kind: 'check' | 'verdict'; readonly ref: string };

export interface RecordEvidenceInput {
  readonly store: ClaimStore;

  // null: the server has no `github` config, so a `check` or `verdict` is refused
  readonly forge: Forge | null;
  readonly verifier: Verifier | null;

  // the name of the check run that runs the verify gate
  readonly gateCheck: string;
  readonly rules: ItemRules;
  readonly call: CallRef;
  readonly draft: EvidenceDraft;
  readonly now: Instant;
  readonly newId: NewId;
}

// `retry`: a forge read failed and nothing was written
export type RecordEvidenceResult =
  | { readonly kind: 'recorded'; readonly factId: FactId }
  | { readonly kind: 'retry' }
  | { readonly kind: 'refused'; readonly reason: 'no-attempt' | 'not-current' }
  | ({ readonly kind: 'refused' } & CheckedEvidenceRefusal);
