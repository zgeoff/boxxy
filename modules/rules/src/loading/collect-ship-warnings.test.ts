import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { loadWaitRules } from '../test-utils/load-wait-rules.ts';

test('it warns about each spawn repo with no repos entry when a step waits on shipped', () => {
  const result = loadWaitRules({
    head: 'repos:\n  example/app: { ships: { release: {} } }',
    spawnRepos: ['example/app', 'example/notes', 'example/docs'],
  });

  invariant(result.kind === 'loaded', 'the rules load');

  expect(result.warnings).toStrictEqual([
    'the repo example/notes has no repos entry, so its items skip the verify step, which waits on shipped',
    'the repo example/docs has no repos entry, so its items skip the verify step, which waits on shipped',
  ]);
});

test('it warns about no repo that has an entry with ships none', () => {
  const result = loadWaitRules({
    head: 'repos:\n  example/notes: { ships: none }',
    spawnRepos: ['example/notes'],
  });

  invariant(result.kind === 'loaded', 'the rules load');

  expect(result.warnings).toStrictEqual([]);
});

test('it warns about no repo when no step waits on shipped', () => {
  const result = loadWaitRules({
    step: '    - { phase: verify, maxAttempts: 1, timeoutMinutes: 30, on: { verified: next } }',
    spawnRepos: ['example/notes'],
  });

  invariant(result.kind === 'loaded', 'the rules load');

  expect(result.warnings).toStrictEqual([]);
});
