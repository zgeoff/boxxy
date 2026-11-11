import { expect, test } from 'bun:test';
import { evidenceRowSchema } from './evidence-row-schema.ts';

test('it accepts an evidence row of a test', () => {
  const row = {
    factId: '0192f0c5-3c4d-7e5f-a061-7b8c9d0e1f2a',
    attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
    kind: 'test',
    ref: 'src/upload.test.ts: it sends the upload again',
    observed: '42 passed',
    source: 'agent',
    at: 1000,
  };

  const parsed: unknown = evidenceRowSchema.safeParse(row).data;

  expect(parsed).toStrictEqual(row);
});

test('it rejects an evidence row of an unknown source', () => {
  expect(evidenceRowSchema.safeParse({ source: 'guess' }).error?.issues).toPartiallyContain({
    path: ['source'],
  });
});
