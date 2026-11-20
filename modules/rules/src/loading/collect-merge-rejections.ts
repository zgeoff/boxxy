import type { LoadRejection } from '@boxxy/model';
import { mergePhase } from '../constants.ts';
import type { ParsedRulesFile } from '../parse/rules-file-schema.ts';
import { buildRejection } from './build-rejection.ts';

// The edge shape that each sign-off outcome of the merge step takes when the rules set
// `merge.signoff`: the hold is the sign-off hold, and the send-back is a jump with its own `max`.
const signoffEdges = [
  { outcome: 'needs-signoff', expected: 'hold' },
  { outcome: 'changes-requested', expected: 'to' },
] as const;

// An empty `merge.checks` is valid: the merge step waits on the union of the list and the base
// branch's required checks, so each repo's own ruleset says what a merge needs.
export function collectMergeRejections(file: ParsedRulesFile): LoadRejection[] {
  if (file.merge === undefined) {
    return Object.entries(file.pipelines).flatMap(([pipeline, steps]) =>
      steps.flatMap((step, index) =>
        step.phase === mergePhase
          ? [
              buildRejection(['pipelines', pipeline, index, 'phase'], {
                kind: 'merge-without-rules',
              }),
            ]
          : [],
      ),
    );
  }

  const names = file.merge.signoff.map((rule) => rule.name);

  const duplicates = file.merge.signoff.flatMap((rule, index) =>
    names.indexOf(rule.name) === index
      ? []
      : [
          buildRejection(['merge', 'signoff', index, 'name'], {
            kind: 'duplicate-signoff-rule',
            name: rule.name,
          }),
        ],
  );

  if (file.merge.signoff.length === 0) {
    return duplicates;
  }

  const edgeRejections = Object.entries(file.pipelines).flatMap(([pipeline, steps]) =>
    steps.flatMap((step, index) =>
      step.phase === mergePhase
        ? signoffEdges.flatMap((signoffEdge) => {
            const outcome = signoffEdge.outcome;
            const expected = signoffEdge.expected;
            const edge = Object.hasOwn(step.on, outcome) ? step.on[outcome] : undefined;

            return edge !== undefined && !(typeof edge === 'object' && expected in edge)
              ? [
                  buildRejection(['pipelines', pipeline, index, 'on', outcome], {
                    kind: 'signoff-edge-kind',
                    phase: step.phase,
                    outcome,
                    expected,
                  }),
                ]
              : [];
          })
        : [],
    ),
  );

  return [...duplicates, ...edgeRejections];
}
