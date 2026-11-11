import { expect, test } from 'bun:test';
import { conceptPins, concepts } from '@boxxy/planning';
import { loadRules } from '@boxxy/rules';
import { buildExampleLoadInput } from '@boxxy/rules/test-utils/build-example-load-input';
import { phaseKinds } from './phase-kinds.ts';

test('it loads the example rules file against the four phase kinds and the built-in concepts', () => {
  const example = buildExampleLoadInput();

  const result = loadRules({
    checkout: example.checkout,
    concepts,
    pins: conceptPins,
    phases: phaseKinds,
  });

  const phases = new Map(phaseKinds.map((phase) => [phase.name, phase]));

  expect(result).toStrictEqual({
    kind: 'loaded',
    rules: expect.objectContaining({ phases }),
    warnings: [],
  });
});
