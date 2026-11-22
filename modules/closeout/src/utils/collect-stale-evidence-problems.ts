import type { BuildCloseOut, CloseOutContext, CloseOutProblem } from '@boxxy/model';

// One problem for each cited `check` or `verdict` recorded at another head than the pull request's
// now, or when no open pull request gave a head. A `blocked` or `abandoned` close-out has no
// head read, so it gets none.
export function collectStaleEvidenceProblems(
  closeOut: BuildCloseOut,
  ctx: CloseOutContext,
): CloseOutProblem[] {
  if (closeOut.result.kind !== 'built') {
    return [];
  }

  const rows = new Map(ctx.evidence.map((row) => [row.factId, row]));

  return closeOut.criteria.flatMap((entry) => {
    const row = rows.get(entry.evidence);

    if (row === undefined || row.head === null || row.head === ctx.head) {
      return [];
    }

    return [
      {
        kind: 'stale-evidence' as const,
        criterion: entry.criterion,
        evidence: entry.evidence,
        recordedAt: row.head,
        head: ctx.head,
        cause: ctx.head === null ? (ctx.noHeadCause ?? 'closed') : null,
      },
    ];
  });
}
