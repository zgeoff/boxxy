import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockV1AttemptRow } from '../test-utils/build-mock-v1-attempt-row.ts';
import { collectSeatSync } from './collect-seat-sync.ts';

test('it changes nothing when the limits still count every seat', () => {
  const workers = brandSchemas.limitName.parse('workers');
  const attempt = buildMockV1AttemptRow({ state: 'running', holdGen: 1 });

  const seat = {
    limit: workers,
    attempt: attempt.id,
    holdGen: 1,
    overCap: false,
    takenAt: brandSchemas.instant.parse(1000),
    releasedAt: null,
  };

  const sync = collectSeatSync({
    limits: [{ name: workers, max: 7, counts: {} }],
    held: [seat],
    attempts: [attempt],
    at: brandSchemas.instant.parse(5000),
  });

  expect(sync).toStrictEqual({ release: [], take: [] });
});

test('it releases each seat of a limit that went', () => {
  const reviews = brandSchemas.limitName.parse('reviews');
  const attempt = buildMockV1AttemptRow({ state: 'running', holdGen: 1 });

  const seat = {
    limit: reviews,
    attempt: attempt.id,
    holdGen: 1,
    overCap: false,
    takenAt: brandSchemas.instant.parse(1000),
    releasedAt: null,
  };

  const sync = collectSeatSync({
    limits: [],
    held: [seat],
    attempts: [attempt],
    at: brandSchemas.instant.parse(5000),
  });

  expect(sync).toStrictEqual({ release: [seat], take: [] });
});

test('it releases the seat of a limit that no longer counts the stored fields', () => {
  const ownerDesign = brandSchemas.limitName.parse('owner-design');

  const attempt = buildMockV1AttemptRow({
    state: 'running',
    holdGen: 1,
    fields: { phase: ['design'], designMode: ['agent'] },
  });

  const seat = {
    limit: ownerDesign,
    attempt: attempt.id,
    holdGen: 1,
    overCap: false,
    takenAt: brandSchemas.instant.parse(1000),
    releasedAt: null,
  };

  const sync = collectSeatSync({
    limits: [{ name: ownerDesign, max: 1, counts: { designMode: ['attended'] } }],
    held: [seat],
    attempts: [attempt],
    at: brandSchemas.instant.parse(5000),
  });

  expect(sync).toStrictEqual({ release: [seat], take: [] });
});

test('it seats each seated attempt in a new limit, past max once the limit is full', () => {
  const builds = brandSchemas.limitName.parse('builds');
  const at = brandSchemas.instant.parse(5000);

  const first = buildMockV1AttemptRow({
    state: 'running',
    holdGen: 1,
    fields: { phase: ['build'] },
  });

  const second = buildMockV1AttemptRow({
    state: 'closing',
    holdGen: 2,
    fields: { phase: ['build'] },
  });

  const sync = collectSeatSync({
    limits: [{ name: builds, max: 1, counts: { phase: ['build'] } }],
    held: [],
    attempts: [first, second],
    at,
  });

  expect(sync).toStrictEqual({
    release: [],
    take: [
      {
        limit: builds,
        attempt: first.id,
        holdGen: 1,
        overCap: false,
        takenAt: at,
        releasedAt: null,
      },
      {
        limit: builds,
        attempt: second.id,
        holdGen: 2,
        overCap: true,
        takenAt: at,
        releasedAt: null,
      },
    ],
  });
});

test.each(['sleeping', 'succeeded', 'failed'] as const)(
  'it seats no %s attempt in a new limit',
  (state) => {
    const sync = collectSeatSync({
      limits: [{ name: brandSchemas.limitName.parse('workers'), max: 7, counts: {} }],
      held: [],
      attempts: [buildMockV1AttemptRow({ state })],
      at: brandSchemas.instant.parse(5000),
    });

    expect(sync).toStrictEqual({ release: [], take: [] });
  },
);
