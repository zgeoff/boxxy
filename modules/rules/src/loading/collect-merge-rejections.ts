import type { LoadRejection } from '@boxxy/model';
import { mergePhase } from '../constants.ts';
import type { ParsedRulesFile } from '../parse/rules-file-schema.ts';
import { buildRejection } from './build-rejection.ts';

// An empty `merge.checks` is valid: the merge step waits on the union of the list and the base
// branch's required checks, so each repo's own ruleset says what a merge needs.
export function collectMergeRejections(file: ParsedRulesFile): LoadRejection[] {
  if (file.merge !== undefined) {
    return [];
  }

  return Object.entries(file.pipelines).flatMap(([pipeline, steps]) =>
    steps.flatMap((step, index) =>
      step.phase === mergePhase
        ? [buildRejection(['pipelines', pipeline, index, 'phase'], { kind: 'merge-without-rules' })]
        : [],
    ),
  );
}
