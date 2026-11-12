import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { findLatestDesign } from './find-latest-design.ts';

test('it reads the design of the latest succeeded design attempt', () => {
  const attempt = buildMockV1AttemptRow({
    phase: brandSchemas.phaseName.parse('design'),
    state: 'succeeded',
    closeOut: {
      result: { kind: 'designed', design: { text: '## Plan\n\nRetry once.', location: null } },
      friction: [],
      frictionDropped: 0,
    },
  });

  expect(findLatestDesign([attempt])).toStrictEqual({
    text: '## Plan\n\nRetry once.',
    location: null,
  });
});

test('it gives no design for a history with none', () => {
  expect(findLatestDesign([])).toBeNull();
});
