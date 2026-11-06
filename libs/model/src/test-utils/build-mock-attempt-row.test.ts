import { expect, test } from 'bun:test';
import { contentHash } from '@boxxy/content-hash';
import { buildMockAttemptRow } from './build-mock-attempt-row.ts';

test('it builds a default attempt row', () => {
  const built: unknown = buildMockAttemptRow();

  expect(built).toStrictEqual({
    id: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    item: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    phase: 'build',
    number: 1,
    runner: 'runner-1',
    recipeHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
    rulesVersion: expect.stringMatching(/^[0-9a-f]{64}$/u),
    pool: 'build',
    slot: 1,
    slotGen: 1,
    leaseGen: 1,
    spawnRequest: { prompt: expect.any(String) },
    spawnRequestHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
    state: 'succeeded',
    failure: null,
    atcSession: expect.any(String),
    closeOut: null,
    claimedAt: expect.any(Number),
    startedAt: expect.any(Number),
    endedAt: expect.any(Number),
  });
});

test('it applies overrides on top of the defaults', () => {
  const attempt = buildMockAttemptRow({ state: 'failed', failure: 'session-lost' });

  expect(attempt).toStrictEqual(
    expect.objectContaining({ state: 'failed', failure: 'session-lost' }),
  );
});

test('it sets the spawn request hash to the content hash of the spawn request', () => {
  const attempt = buildMockAttemptRow();

  expect(attempt.spawnRequestHash).toBe(contentHash(attempt.spawnRequest));
});

test('it sets the spawn request hash to the content hash of an overridden spawn request', () => {
  const attempt = buildMockAttemptRow({ spawnRequest: { prompt: 'Check the upload' } });

  expect(attempt.spawnRequestHash).toBe(contentHash({ prompt: 'Check the upload' }));
});

test('it sets the spawn request hash to the content hash of a null spawn request', () => {
  const attempt = buildMockAttemptRow({ spawnRequest: null });

  expect(attempt.spawnRequestHash).toBe(contentHash(null));
});

test('it keeps an overridden spawn request hash', () => {
  const hash = contentHash({ prompt: 'Another request' });

  const attempt = buildMockAttemptRow({
    spawnRequest: { prompt: 'Check the upload' },
    spawnRequestHash: hash,
  });

  expect(attempt.spawnRequestHash).toBe(hash);
});
