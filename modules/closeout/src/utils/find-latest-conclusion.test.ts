import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { findLatestConclusion } from './find-latest-conclusion.ts';

test('it reads the conclusion of the latest succeeded design attempt', () => {
  const attempt = buildMockV1AttemptRow({
    phase: brandSchemas.phaseName.parse('design'),
    state: 'succeeded',
    closeOut: {
      result: {
        kind: 'designed',
        design: { text: 'Read the upload logs.', location: null },
        conclusion: 'The retries come from the proxy timeout.',
      },
      friction: [],
      frictionDropped: 0,
    },
  });

  expect(findLatestConclusion([attempt])).toBe('The retries come from the proxy timeout.');
});

test('it gives no conclusion for a stored design close-out that holds none', () => {
  const attempt = buildMockV1AttemptRow({
    phase: brandSchemas.phaseName.parse('design'),
    state: 'succeeded',
    closeOut: {
      result: { kind: 'designed', design: { text: 'One retry per upload row', location: null } },
      friction: [],
      frictionDropped: 0,
    },
  });

  expect(findLatestConclusion([attempt])).toBeNull();
});

test('it gives no conclusion for a history with no design', () => {
  expect(findLatestConclusion([])).toBeNull();
});
