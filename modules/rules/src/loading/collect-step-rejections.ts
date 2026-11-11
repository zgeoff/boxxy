import type { LoadRejection, PhaseKind, PhaseName } from '@boxxy/model';
import { engineHoldReasons, engineOutcomes } from '@boxxy/model';
import { P, match } from 'ts-pattern';
import type { ParsedRulesFile, ParsedStep } from '../parse/rules-file-schema.ts';
import { buildRejection } from './build-rejection.ts';

export function collectStepRejections(
  file: ParsedRulesFile,
  phases: ReadonlyMap<PhaseName, PhaseKind>,
): LoadRejection[] {
  return Object.entries(file.pipelines).flatMap(([pipeline, steps]) =>
    steps.flatMap((step, index) => {
      const path = ['pipelines', pipeline, index];
      const phase = phases.get(step.phase);

      return [
        ...(phase === undefined
          ? [buildRejection([...path, 'phase'], { kind: 'unknown-phase', phase: step.phase })]
          : collectOutcomeRejections(step, phase, path)),
        ...(step.timeoutMinutes === undefined
          ? [buildRejection(path, { kind: 'step-without-timeout', phase: step.phase })]
          : []),
        ...Object.entries(step.on).flatMap(([outcome, edge]) =>
          collectEdgeRejections(edge, {
            steps,
            index,
            phase: step.phase,
            outcome,
            path: [...path, 'on', outcome],
          }),
        ),
      ];
    }),
  );
}

function collectOutcomeRejections(
  step: ParsedStep,
  phase: PhaseKind,
  path: readonly PropertyKey[],
): LoadRejection[] {
  const listed: readonly string[] = phase.outcomes;

  return [
    ...engineOutcomes
      .filter((outcome) => listed.includes(outcome))
      .map((outcome) =>
        buildRejection([...path, 'phase'], {
          kind: 'engine-outcome-listed',
          phase: step.phase,
          outcome,
        }),
      ),
    ...listed
      .filter((outcome) => !Object.hasOwn(step.on, outcome))
      .map((outcome) =>
        buildRejection([...path, 'on'], { kind: 'unmapped-outcome', phase: step.phase, outcome }),
      ),
    ...Object.keys(step.on)
      .filter((outcome) => !listed.includes(outcome))
      .map((outcome) =>
        buildRejection([...path, 'on', outcome], {
          kind: 'unknown-outcome',
          phase: step.phase,
          outcome,
        }),
      ),
  ];
}

type ParsedEdge = ParsedStep['on'][string];

interface EdgeContext {
  readonly steps: readonly ParsedStep[];
  readonly index: number;
  readonly phase: PhaseName;
  readonly outcome: string;
  readonly path: readonly PropertyKey[];
}

function collectEdgeRejections(edge: ParsedEdge, context: EdgeContext): LoadRejection[] {
  const engineReasons: readonly string[] = engineHoldReasons;

  return match(edge)
    .with(P.string, { end: P.string }, () => [])
    .with({ hold: P.string }, (held) =>
      engineReasons.includes(held.hold)
        ? [
            buildRejection([...context.path, 'hold'], {
              kind: 'engine-hold-reason',
              phase: context.phase,
              outcome: context.outcome,
              reason: held.hold,
            }),
          ]
        : [],
    )
    .with({ to: P.string }, (jump) => collectJumpRejections(jump, context))
    .exhaustive();
}

function collectJumpRejections(
  jump: Extract<ParsedEdge, { to: string }>,
  context: EdgeContext,
): LoadRejection[] {
  const target = context.steps.findIndex((step) => step.phase === jump.to);
  const edge = { phase: context.phase, outcome: context.outcome };

  if (target === -1) {
    return [
      buildRejection(context.path, {
        kind: 'edge-to-unknown-phase',
        phase: context.phase,
        to: jump.to,
      }),
    ];
  }

  // an edge to its own step loops, as a backward edge does
  const isBack = target <= context.index;

  if (isBack && jump.max === undefined) {
    return [buildRejection(context.path, { kind: 'open-loop', ...edge })];
  }

  if (!isBack && jump.resume === true) {
    return [buildRejection(context.path, { kind: 'resume-on-forward-edge', ...edge })];
  }

  return [];
}
