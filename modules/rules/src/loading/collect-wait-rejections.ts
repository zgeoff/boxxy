import type { LoadRejection, PhaseKind, PhaseName, WaitKind, WorkerKindName } from '@boxxy/model';
import type { ParsedRulesFile } from '../parse/rules-file-schema.ts';
import { buildRejection } from './build-rejection.ts';

interface WaitRegistry {
  readonly waits: ReadonlyMap<string, WaitKind>;
  readonly phases: ReadonlyMap<PhaseName, PhaseKind>;
  readonly workers: readonly WorkerKindName[];
}

// A wait must be a kind the server registers, must come after an outcome that an earlier step's
// phase kind has, and must have the worker it reads through.
export function collectWaitRejections(
  file: ParsedRulesFile,
  registry: WaitRegistry,
): LoadRejection[] {
  const rejections: LoadRejection[] = [];

  for (const [pipeline, steps] of Object.entries(file.pipelines)) {
    steps.forEach((step, index) => {
      (step.waits ?? []).forEach((name, waitIndex) => {
        const path = ['pipelines', pipeline, index, 'waits', waitIndex];

        rejections.push(...collectWaitRejection({ registry, steps, step, index, name, path }));
      });
    });
  }

  return rejections;
}

type ParsedStep = Exclude<
  ParsedRulesFile['pipelines'][keyof ParsedRulesFile['pipelines']],
  undefined
>[number];

interface WaitRejectionInput {
  readonly registry: WaitRegistry;
  readonly steps: readonly ParsedStep[];
  readonly step: ParsedStep;
  readonly index: number;
  readonly name: string;
  readonly path: (string | number)[];
}

function collectWaitRejection(input: WaitRejectionInput): LoadRejection[] {
  const registry = input.registry;
  const step = input.step;
  const name = input.name;
  const path = input.path;
  const kind = registry.waits.get(name);

  if (kind === undefined) {
    return [buildRejection(path, { kind: 'unknown-wait-kind', phase: step.phase, wait: name })];
  }

  const rejections: LoadRejection[] = [];

  const isOutcomeEarlier = input.steps
    .slice(0, input.index)
    .some((earlier) => registry.phases.get(earlier.phase)?.outcomes.includes(kind.after.outcome));

  if (!isOutcomeEarlier) {
    rejections.push(
      buildRejection(path, {
        kind: 'wait-without-outcome',
        phase: step.phase,
        wait: name,
        outcome: kind.after.outcome,
      }),
    );
  }

  if (kind.worker !== undefined && !registry.workers.includes(kind.worker)) {
    rejections.push(
      buildRejection(path, {
        kind: 'wait-without-worker',
        phase: step.phase,
        wait: name,
        worker: kind.worker,
      }),
    );
  }

  return rejections;
}
