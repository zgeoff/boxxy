import { expect, test } from 'bun:test';
import { mergeObservationSchema } from '../merge/merge-observation-schema.ts';
import { toMergeObservationJSON } from '../merge/to-merge-observation-json.ts';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockMergeObservation } from './build-mock-merge-observation.ts';

test('it builds an observation that the observation schema reads back from its JSON form', () => {
  const observation = buildMockMergeObservation();
  const parsed: unknown = mergeObservationSchema.parse(toMergeObservationJSON(observation));

  expect(parsed).toStrictEqual(observation);
});

test('it puts the review and the verify reading at the head it is given', () => {
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');
  const observation = buildMockMergeObservation({ head });

  expect([observation.review?.head, observation.verify.head]).toStrictEqual([head, head]);
});
