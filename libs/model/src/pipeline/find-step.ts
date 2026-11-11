import type { Pipeline, PipelineStep } from '../rules/types.ts';
import type { PhaseName } from '../types.ts';

export function findStep(pipeline: Pipeline, phase: PhaseName): PipelineStep | undefined {
  return pipeline.steps.find((step) => step.phase === phase);
}
