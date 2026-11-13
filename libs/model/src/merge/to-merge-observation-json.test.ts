import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockMergeObservation } from '../test-utils/build-mock-merge-observation.ts';
import { mergeObservationSchema } from './merge-observation-schema.ts';
import { toMergeObservationJSON } from './to-merge-observation-json.ts';

test('it writes the checks as an object by name', () => {
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');

  const json = toMergeObservationJSON({
    pullRequest: { repo: brandSchemas.repoName.parse('acme/lamps'), number: 7 },
    state: 'open',
    head,
    mergeable: 'clean',
    checks: new Map([
      ['build', 'success'],
      ['verify / gate', 'pending'],
    ]),
    baseRequired: ['build'],
    mergeCommit: null,
    review: null,
    verify: { status: 'not-covered', head },
  });

  expect(json).toStrictEqual({
    pullRequest: { repo: 'acme/lamps', number: 7 },
    state: 'open',
    head,
    mergeable: 'clean',
    checks: { build: 'success', 'verify / gate': 'pending' },
    baseRequired: ['build'],
    mergeCommit: null,
    review: null,
    verify: { status: 'not-covered', head },
  });
});

test('it writes a form that the observation schema reads back as the same observation', () => {
  const observation = buildMockMergeObservation();
  const parsed: unknown = mergeObservationSchema.parse(toMergeObservationJSON(observation));

  expect(parsed).toStrictEqual(observation);
});
