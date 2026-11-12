import { expect, test } from 'bun:test';
import { conceptPins, concepts } from '@boxxy/planning';
import { loadRules } from '@boxxy/rules';
import { buildExampleLoadInput } from '@boxxy/rules/test-utils/build-example-load-input';
import { phaseKinds } from './phase-kinds.ts';
import { createReviewPhase } from './phases/create-review-phase.ts';

test('it loads the example rules file against the phase kinds, the review phase and the built-in concepts', () => {
  const example = buildExampleLoadInput();
  const phases = [...phaseKinds, createReviewPhase({ buildCommand: () => 'noslop review' })];

  const result = loadRules({
    checkout: example.checkout,
    workers: example.workers,
    concepts,
    pins: conceptPins,
    phases,
  });

  const byName = new Map(phases.map((phase) => [phase.name, phase]));

  expect(result).toStrictEqual({
    kind: 'loaded',
    rules: expect.objectContaining({ phases: byName }),
    warnings: [],
  });
});
