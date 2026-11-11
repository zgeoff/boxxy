import { expect, test } from 'bun:test';
import { buildExampleLoadInput } from './build-example-load-input.ts';

test('it gives the example rules file with the prompt of each of its five recipes', () => {
  const input = buildExampleLoadInput();

  expect([...input.checkout.files.keys()]).toStrictEqual([
    'rules.yaml',
    'prompts/triage-v1.md',
    'prompts/design-v1.md',
    'prompts/design-attended-v1.md',
    'prompts/build-v1.md',
    'prompts/review-v1.md',
  ]);
});

test('it pins a stand-in for each concept the example rules file names', () => {
  const input = buildExampleLoadInput();

  expect(input.concepts.map((concept) => `${concept.name}@${concept.version}`)).toStrictEqual(
    [...input.pins.values()].map((pin) => pin.ref),
  );
});
