import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { loadReworkPromptRules } from './load-rework-prompt-rules.ts';

test('it gives the build recipe the rework prompt, and the prompts its text', () => {
  const loaded = loadReworkPromptRules('Answer {{ findings }}.\n');

  const result: unknown = {
    reworkPrompt: loaded.rules.recipes.get(brandSchemas.recipeName.parse('build-v1'))?.recipe
      .reworkPrompt,
    text: loaded.prompts.get('prompts/build-rework-v1.md'),
  };

  expect(result).toStrictEqual({
    reworkPrompt: 'prompts/build-rework-v1.md',
    text: 'Answer {{ findings }}.\n',
  });
});
