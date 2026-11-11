import { expect, test } from 'bun:test';
import { loadMockRules } from './load-mock-rules.ts';

test('it loads a pipeline with the steps it is given', () => {
  const rules = loadMockRules({
    steps: [
      {
        phase: 'build',
        maxAttempts: 2,
        timeoutMinutes: 30,
        on: { built: 'next', blocked: 'again', abandoned: 'again' },
      },
    ],
  });

  const phases: string[] = [...rules.kinds.values()].flatMap((kind) =>
    kind.pipeline.steps.map((step) => step.phase),
  );

  expect(phases).toStrictEqual(['build']);
});
