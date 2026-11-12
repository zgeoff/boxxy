import { expect, test } from 'bun:test';
import { buildMockAtcSessionRead } from './build-mock-atc-session-read.ts';

test('it builds a session whose agent runs and works', () => {
  const read = buildMockAtcSessionRead();

  expect([read.session.state, read.session.lifecycle.harness]).toStrictEqual([
    'running',
    'running',
  ]);
});

test('it keeps the lifecycle field that an override leaves out', () => {
  const read = buildMockAtcSessionRead({ session: { lifecycle: { harness: 'suspended' } } });

  expect(read.session.lifecycle).toStrictEqual({ desired: 'run', harness: 'suspended' });
});
