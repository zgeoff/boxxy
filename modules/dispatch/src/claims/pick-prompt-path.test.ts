import { expect, test } from 'bun:test';
import type { AttemptState, Recipe } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { pickPromptPath } from './pick-prompt-path.ts';

test.each([
  ['the first attempt of the phase', [], 'prompts/build-v1.md'],
  ['a retry after a blocked build', [['build', 'failed']], 'prompts/build-v1.md'],
  ['a build after a design that succeeded', [['design', 'succeeded']], 'prompts/build-v1.md'],
  [
    'a build sent back after a build that succeeded',
    [
      ['build', 'succeeded'],
      ['review', 'succeeded'],
    ],
    'prompts/build-rework-v1.md',
  ],
  [
    'a retry after a rework build that failed',
    [
      ['build', 'succeeded'],
      ['merge', 'failed'],
      ['build', 'failed'],
    ],
    'prompts/build-rework-v1.md',
  ],
] as const)('it picks the template of %s', (_, history, expected) => {
  const recipe: Recipe = {
    agent: 'claude',
    model: 'example-model',
    effort: 'medium',
    prompt: 'prompts/build-v1.md',
    reworkPrompt: 'prompts/build-rework-v1.md',
    source: brandSchemas.sourceName.parse('subscription'),
    skills: [],
  };

  const rows = history.map(([phase, state]: readonly [string, AttemptState]) =>
    buildMockV1AttemptRow({ phase: brandSchemas.phaseName.parse(phase), state }),
  );

  expect(pickPromptPath(recipe, rows, brandSchemas.phaseName.parse('build'))).toBe(expected);
});

test('it picks the first template of a rework round when the recipe has no rework prompt', () => {
  const recipe: Recipe = {
    agent: 'claude',
    model: 'example-model',
    effort: 'medium',
    prompt: 'prompts/build-v1.md',
    source: brandSchemas.sourceName.parse('subscription'),
    skills: [],
  };

  const rows = [
    buildMockV1AttemptRow({ phase: brandSchemas.phaseName.parse('build'), state: 'succeeded' }),
  ];

  expect(pickPromptPath(recipe, rows, brandSchemas.phaseName.parse('build'))).toBe(
    'prompts/build-v1.md',
  );
});
