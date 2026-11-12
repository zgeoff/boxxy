import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { loadVerifyRules } from './load-verify-rules.ts';

test('it loads a verify step after review on a recipe with the grader it names', () => {
  const rules = loadVerifyRules({ session: 'builder', resume: true });
  const kind = rules.kinds.get(brandSchemas.itemKindName.parse('core.issue'));

  const loaded: unknown = {
    steps: kind?.pipeline.steps.map((step) => step.phase),
    recipe: kind?.recipes['verify'],
    session: rules.recipes.get(brandSchemas.recipeName.parse('verify-v1'))?.recipe.session,
  };

  expect(loaded).toStrictEqual({
    steps: ['triage', 'design', 'build', 'review', 'verify'],
    recipe: 'verify-v1',
    session: 'builder',
  });
});

test('it leaves no resume edge in the pipeline when resume is false', () => {
  const rules = loadVerifyRules({ session: 'fresh', resume: false });
  const kind = rules.kinds.get(brandSchemas.itemKindName.parse('core.issue'));
  const edges = kind?.pipeline.steps.flatMap((step) => Object.values(step.on)) ?? [];

  expect(edges).not.toPartiallyContain({ resume: true });
});
