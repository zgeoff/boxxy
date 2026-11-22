import { splitFriction } from '@boxxy/closeout';
import type { EvidenceRow } from '@boxxy/model';
import { buildCloseOutSchema } from '@boxxy/model';

const bodySchema = buildCloseOutSchema.omit({ frictionDropped: true });

// True for a valid `built` build close-out that cites a `check` or a `verdict`. Validity is the
// parser's: the body is split of friction the same way first. Any other body never waits on the forge.
// Pure.
export function shouldReadHead(
  phase: string,
  body: unknown,
  evidence: readonly EvidenceRow[],
): boolean {
  if (phase !== 'build') {
    return false;
  }

  const parsed = bodySchema.safeParse(splitFriction(body).candidate);

  if (!parsed.success || parsed.data.result.kind !== 'built') {
    return false;
  }

  const cited = new Set(parsed.data.criteria.map((entry) => entry.evidence));

  return evidence.some(
    (row) => cited.has(row.factId) && (row.kind === 'check' || row.kind === 'verdict'),
  );
}
