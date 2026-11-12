import type { ChangedFile } from '@boxxy/model';

// The changed lines in the files that had no open finding at the earlier review.
export function countUnrelatedLines(
  changed: readonly ChangedFile[],
  findingPaths: readonly string[],
): number {
  const withFindings = new Set(findingPaths);

  return changed
    .filter((file) => !withFindings.has(file.path))
    .reduce((sum, file) => sum + file.changedLines, 0);
}
