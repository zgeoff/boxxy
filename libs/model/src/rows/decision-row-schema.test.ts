import { expect, test } from 'bun:test';
import { decisionRowSchema } from './decision-row-schema.ts';

test('it accepts a wake decision with the count of each limit that counts it', () => {
  const row = {
    id: '0192f0c5-2b3c-7d4e-9f50-6a7b8c9d0e1f',
    attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
    item: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
    kind: 'wake',
    pool: 'main',
    rulesVersion: '60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752',
    snapshotHash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    storeVersion: 42,
    pepysOffsets: {},
    faults: [{ plugin: 'area', kind: 'filter-field', item: null, error: 'no area' }],
    limits: [{ limit: 'workers', held: 2, max: 3 }],
    at: 5000,
  };

  const parsed: unknown = decisionRowSchema.safeParse(row).data;

  expect(parsed).toStrictEqual(row);
});

test('it rejects a limit count below zero', () => {
  const row = { limits: [{ limit: 'workers', held: -1, max: 3 }] };

  expect(decisionRowSchema.safeParse(row).error?.issues).toPartiallyContain({
    path: ['limits', 0, 'held'],
  });
});
