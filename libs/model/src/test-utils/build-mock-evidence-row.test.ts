import { expect, test } from 'bun:test';
import { buildMockEvidenceRow } from './build-mock-evidence-row.ts';

test('it builds a default evidence row', () => {
  const built: unknown = buildMockEvidenceRow();

  expect(built).toStrictEqual({
    factId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    attempt: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    kind: 'test',
    ref: expect.any(String),
    observed: null,
    source: 'agent',
    at: expect.any(Number),
  });
});

test('it applies overrides on top of the defaults', () => {
  const row = buildMockEvidenceRow({ kind: 'ci-run', observed: 'green' });

  expect(row).toStrictEqual(expect.objectContaining({ kind: 'ci-run', observed: 'green' }));
});
