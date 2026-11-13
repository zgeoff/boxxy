import { expect, test } from 'bun:test';
import { conceptPins, concepts } from '@boxxy/planning';
import { loadRules } from '@boxxy/rules';
import { buildExampleLoadInput } from '@boxxy/rules/test-utils/build-example-load-input';
import invariant from 'tiny-invariant';
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

test.each([
  ['needs-owner', '        needs-owner: { hold: needs-owner }'],
  ['split', '        split: { end: split }'],
])('it refuses the example rules file when the triage step leaves %s unmapped', (outcome, line) => {
  const example = buildExampleLoadInput();
  const bytes = example.checkout.files.get('rules.yaml');

  invariant(bytes !== undefined, 'the example holds rules.yaml');

  const lines = new TextDecoder().decode(bytes).split('\n');

  const kept = lines.filter((candidate) => !candidate.startsWith(line)).join('\n');

  const files = new Map([
    ...example.checkout.files,
    ['rules.yaml', new TextEncoder().encode(kept)],
  ]);

  const result: unknown = loadRules({
    checkout: { commit: example.checkout.commit, files },
    workers: example.workers,
    concepts,
    pins: conceptPins,
    phases: [...phaseKinds, createReviewPhase({ buildCommand: () => 'noslop review' })],
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'pipelines.standard[0].on',
        reason: { kind: 'unmapped-outcome', phase: 'triage', outcome },
      },
    ],
  });
});
