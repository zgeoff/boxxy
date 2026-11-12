import { expect, test } from 'bun:test';
import { atcToolResults } from './atc-tool-results.ts';

test('#atc_session_spawn reads a session that carries no lifecycle and no attach time', () => {
  const parsed = atcToolResults.atc_session_spawn.safeParse({
    id: 's1-fake',
    name: 'boxxy/attempt-1',
    createdAt: 1000,
    state: 'running',
  });

  expect(parsed.success).toBeTrue();
});

test.each([
  ['lifecycle', { lastAttachedAt: 1000 }],
  ['lastAttachedAt', { lifecycle: { desired: 'run', harness: 'running' } }],
])('#atc_session_get refuses a read that lacks %s', (_field, fields) => {
  const parsed = atcToolResults.atc_session_get.safeParse({
    session: {
      id: 's1-fake',
      name: 'boxxy/attempt-1',
      createdAt: 1000,
      state: 'running',
      ...fields,
    },
    lastActivityAt: 1000,
  });

  expect(parsed.success).toBeFalse();
});

test('#atc_session_get refuses a lifecycle value atc has not declared', () => {
  const parsed = atcToolResults.atc_session_get.safeParse({
    session: {
      id: 's1-fake',
      name: 'boxxy/attempt-1',
      createdAt: 1000,
      state: 'running',
      lastAttachedAt: 1000,
      lifecycle: { desired: 'run', harness: 'hibernating' },
    },
    lastActivityAt: 1000,
  });

  expect(parsed.success).toBeFalse();
});
