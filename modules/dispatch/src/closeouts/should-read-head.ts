import type { EvidenceRow } from '@boxxy/model';
import { buildCloseOutSchema } from '@boxxy/model';

const bodySchema = buildCloseOutSchema.omit({ frictionDropped: true });

// True for a valid `built` build close-out that cites a `check` or a `verdict`: only that close-out
// needs the pull request's head. A body the phase kind would reject, a `blocked` or `abandoned`
// close-out, and one with no checked citation never wait on the forge. Pure.
export function shouldReadHead(
  phase: string,
  body: unknown,
  evidence: readonly EvidenceRow[],
): boolean {
  if (phase !== 'build') {
    return false;
  }

  const parsed = bodySchema.safeParse(body);

  if (!parsed.success || parsed.data.result.kind !== 'built') {
    return false;
  }

  const cited = new Set(parsed.data.criteria.map((entry) => entry.evidence));

  return evidence.some(
    (row) => cited.has(row.factId) && (row.kind === 'check' || row.kind === 'verdict'),
  );
}
