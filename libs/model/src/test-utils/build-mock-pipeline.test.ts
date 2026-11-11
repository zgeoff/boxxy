import { expect, test } from 'bun:test';
import { buildMockPipeline } from './build-mock-pipeline.ts';

test('it builds the four standard phases in order', () => {
  const pipeline = buildMockPipeline();
  const phases: string[] = pipeline.steps.map((step) => step.phase);

  expect(phases).toStrictEqual(['triage', 'design', 'build', 'review']);
});

test('it replaces the fields of a step it is given', () => {
  const pipeline = buildMockPipeline({ steps: { build: { maxAttempts: 5 } } });

  expect(pipeline.steps.map((step) => step.maxAttempts)).toStrictEqual([2, 2, 5, 2]);
});

test('it builds a phase outside the standard four with the edges it is given', () => {
  const pipeline = buildMockPipeline({
    phases: ['merge'],
    steps: { merge: { on: { merged: 'next' } } },
  });

  expect(pipeline.steps.map((step) => step.on)).toStrictEqual([{ merged: 'next' }]);
});
