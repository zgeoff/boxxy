import { brandSchemas } from '../rows/brand-schemas.ts';
import type { Edge, Pipeline, PipelineStep } from '../rules/types.ts';

const standardOrder = ['triage', 'design', 'build', 'review'];

const standardEdges: Readonly<Record<string, Readonly<Record<string, Edge>>>> = {
  triage: {
    accepted: 'next',
    duplicate: { hold: brandSchemas.rulesHoldReason.parse('duplicate') },
    declined: { hold: brandSchemas.rulesHoldReason.parse('declined') },
  },
  design: {
    designed: 'next',
    blocked: { hold: brandSchemas.rulesHoldReason.parse('blocked') },
    abandoned: 'again',
  },
  build: {
    built: 'next',
    blocked: { hold: brandSchemas.rulesHoldReason.parse('blocked') },
    abandoned: 'again',
  },
  review: {
    passed: { end: 'reviewed' },
    'changes-requested': { to: brandSchemas.phaseName.parse('build'), max: 3, resume: true },
  },
};

interface MockPipelineInput {
  // the phases in order; the four standard phases when left out
  readonly phases?: readonly string[];

  // fields to replace on the step of a phase; `on` is replaced whole
  readonly steps?: Readonly<Record<string, Partial<PipelineStep>>>;
}

// The `standard` pipeline of the v1 rules file: triage, design, build and review, with two
// attempts in a row for each step.
export function buildMockPipeline(input: MockPipelineInput = {}): Pipeline {
  const steps: PipelineStep[] = [];

  for (const phase of input.phases ?? standardOrder) {
    steps.push({
      phase: brandSchemas.phaseName.parse(phase),
      maxAttempts: 2,
      timeoutMinutes: 30,
      on: standardEdges[phase] ?? {},
      ...input.steps?.[phase],
    });
  }

  return { name: brandSchemas.pipelineName.parse('standard'), steps };
}
