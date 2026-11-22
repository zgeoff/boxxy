import type { AttemptRow, CommitSha, StoreChange } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { pickCallAttempt } from '../attempts/pick-call-attempt.ts';
import { readCheckedEvidence } from './read-checked-evidence.ts';
import type { EvidenceDraft, RecordEvidenceInput, RecordEvidenceResult } from './types.ts';

// A `check` or `verdict` is read from the forge outside the store lock, and recorded only when it
// passed at the pull request's head. The write checks the call again in the lock, because a newer
// attempt can take the session while the forge answers.
export async function recordEvidence(input: RecordEvidenceInput): Promise<RecordEvidenceResult> {
  const latest = await input.store.read((tx) => tx.findAttemptBySession(input.call.session));

  const picked = pickCallAttempt(latest, input.call);

  if (picked.kind === 'refused') {
    return picked;
  }

  const draft = input.draft;

  if (draft.kind !== 'check' && draft.kind !== 'verdict') {
    return writeEvidence(input, draft, null);
  }

  const reading = await readCheckedEvidence(input, picked.attempt, draft);

  if (reading.kind === 'retry') {
    return reading;
  }

  if (reading.kind === 'refused') {
    return { kind: 'refused', ...reading.refusal };
  }

  return writeEvidence(input, draft, reading.head);
}

// Writes under the attempt's lease, so the evidence of a settled attempt is refused. A session
// re-sends evidence when it loses the answer, so a row of the same kind, ref and head is a repeat.
function writeEvidence(
  input: RecordEvidenceInput,
  draft: EvidenceDraft,
  head: CommitSha | null,
): Promise<RecordEvidenceResult> {
  return input.store.exclusive(async (tx) => {
    const latest = await tx.findAttemptBySession(input.call.session);

    const picked = pickCallAttempt(latest, input.call);

    if (picked.kind === 'refused') {
      return picked;
    }

    const attempt = picked.attempt;

    const recorded = await tx.listEvidence(attempt.id);

    const repeat = recorded.find(
      (row) => row.kind === draft.kind && row.ref === draft.ref && row.head === head,
    );

    if (repeat !== undefined) {
      return { kind: 'recorded', factId: repeat.factId } as const;
    }

    const factId = brandSchemas.factId.parse(input.newId());
    const observed = 'observed' in draft ? draft.observed : null;

    const result = await tx.applyChange({
      at: input.now,
      under: buildUnder(attempt),
      writes: [
        {
          op: 'insert',
          table: 'evidence',
          row: {
            factId,
            attempt: attempt.id,
            kind: draft.kind,
            ref: draft.ref,
            observed,
            source: 'agent',
            at: input.now,
            head,
          },
        },
      ],
      facts: [
        {
          id: factId,
          type: 'boxxy.evidence.recorded',
          entity: `boxxy:item:${attempt.item}`,
          actor: `boxxy:attempt:${attempt.id}`,
          payload: {
            attempt: attempt.id,
            kind: draft.kind,
            ref: draft.ref,
            observed,
            ...(head === null ? {} : { head }),
          },
        },
      ],
    });

    return result.kind === 'applied'
      ? ({ kind: 'recorded', factId } as const)
      : ({ kind: 'refused', reason: 'not-current' } as const);
  });
}

function buildUnder(attempt: AttemptRow): NonNullable<StoreChange['under']> {
  return { item: attempt.item, phase: attempt.phase, gen: attempt.leaseGen };
}
