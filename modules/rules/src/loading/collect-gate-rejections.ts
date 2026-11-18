import type { LoadRejection } from '@boxxy/model';
import { engineHoldReasons } from '@boxxy/model';
import type { ParsedRulesFile, ParsedStep } from '../parse/rules-file-schema.ts';
import { buildRejection } from './build-rejection.ts';

// A step's gates are `criteria`, `skipWhen` and `waits`; each needs the `skip` edge to settle the step.
export function collectGateRejections(file: ParsedRulesFile): LoadRejection[] {
  return Object.entries(file.pipelines).flatMap(([pipeline, steps]) =>
    steps.flatMap((step, index) =>
      collectStepGateRejections(step, file.criterionTags, ['pipelines', pipeline, index]),
    ),
  );
}

function collectStepGateRejections(
  step: ParsedStep,
  criterionTags: readonly string[],
  path: readonly PropertyKey[],
): LoadRejection[] {
  const hasGate =
    step.criteria !== undefined || step.skipWhen !== undefined || step.waits !== undefined;

  const skip = step.skip;
  const engineReasons: readonly string[] = engineHoldReasons;

  return [
    ...(hasGate && skip === undefined
      ? [buildRejection(path, { kind: 'gate-without-skip', phase: step.phase })]
      : []),
    ...(step.criteria !== undefined && !criterionTags.includes(step.criteria.tagged)
      ? [
          buildRejection([...path, 'criteria', 'tagged'], {
            kind: 'unknown-criterion-tag',
            phase: step.phase,
            tag: step.criteria.tagged,
          }),
        ]
      : []),
    ...(step.skipWhen ?? []).flatMap((condition, conditionIndex) =>
      collectConditionRejections(step, condition, [...path, 'skipWhen', conditionIndex]),
    ),
    ...(typeof skip === 'object' && 'hold' in skip && engineReasons.includes(skip.hold)
      ? [
          buildRejection([...path, 'skip', 'hold'], {
            kind: 'engine-hold-reason',
            phase: step.phase,
            outcome: 'skipped',
            reason: skip.hold,
          }),
        ]
      : []),
  ];
}

const checkPassedCondition = 'checkPassed';

function collectConditionRejections(
  step: ParsedStep,
  condition: Readonly<Record<string, unknown>>,
  path: readonly PropertyKey[],
): LoadRejection[] {
  const [name] = Object.keys(condition);

  if (name !== checkPassedCondition) {
    return [
      buildRejection(path, {
        kind: 'unknown-skip-condition',
        phase: step.phase,
        condition: name ?? '',
      }),
    ];
  }

  const check = condition[name];

  return typeof check === 'string' && check !== ''
    ? []
    : [
        buildRejection([...path, name], {
          kind: 'invalid',
          message: 'checkPassed names a check, as a non-empty string',
        }),
      ];
}
