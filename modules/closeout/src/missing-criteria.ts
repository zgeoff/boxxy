import type {
  BuildCloseOut,
  CriterionId,
  EvidenceRow,
  SliceOneItemView as ItemView,
} from '@boxxy/model';

export function missingCriteria(
  item: ItemView,
  evidence: readonly EvidenceRow[],
  cited: BuildCloseOut['criteria'],
): readonly CriterionId[] {
  const known = new Set(evidence.map((row) => row.factId));

  const met = new Set(
    cited.filter((entry) => known.has(entry.evidence)).map((entry) => entry.criterion),
  );

  return item.acceptance.map((criterion) => criterion.id).filter((id) => !met.has(id));
}
