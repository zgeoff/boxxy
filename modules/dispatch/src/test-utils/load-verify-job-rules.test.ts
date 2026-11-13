import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { loadVerifyJobRules } from './load-verify-job-rules.ts';

test('it loads a verify step between review and merge, graded by the builder, with verify among the workers', () => {
  const rules = loadVerifyJobRules();
  const kind = rules.kinds.get(brandSchemas.itemKindName.parse('core.issue'));
  const merge = kind?.pipeline.steps.find((step) => step.phase === 'merge');

  const loaded: unknown = {
    steps: kind?.pipeline.steps.map((step) => step.phase),
    session: rules.recipes.get(brandSchemas.recipeName.parse('verify-v1'))?.recipe.session,
    unverified: merge?.on['unverified'],
    workers: rules.limits.find((limit) => limit.name === 'workers')?.counts,
  };

  expect(loaded).toStrictEqual({
    steps: ['triage', 'design', 'build', 'review', 'verify', 'merge'],
    session: 'builder',
    unverified: expect.objectContaining({ to: 'verify', max: 2 }),
    workers: { phase: ['triage', 'design', 'build', 'review', 'verify'] },
  });
});
