import type { LoadRejection } from '@boxxy/model';
import { mergePhase } from '../constants.ts';
import type { ParsedRulesFile } from '../parse/rules-file-schema.ts';
import { buildRejection } from './build-rejection.ts';

// The merge step reads the union of `merge.checks` and the base branch's required checks, so a
// non-empty list keeps the union non-empty on a branch that requires no check.
export function collectMergeRejections(file: ParsedRulesFile): LoadRejection[] {
  if (file.merge !== undefined) {
    return file.merge.checks.length === 0
      ? [buildRejection(['merge', 'checks'], { kind: 'empty-merge-checks' })]
      : [];
  }

  return Object.entries(file.pipelines).flatMap(([pipeline, steps]) =>
    steps.flatMap((step, index) =>
      step.phase === mergePhase
        ? [buildRejection(['pipelines', pipeline, index, 'phase'], { kind: 'merge-without-rules' })]
        : [],
    ),
  );
}
