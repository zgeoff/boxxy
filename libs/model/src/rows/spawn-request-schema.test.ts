import { expect, test } from 'bun:test';
import { spawnRequestSchema } from './spawn-request-schema.ts';

test('it accepts a stored spawn request', () => {
  const request = {
    target: 'worker-host',
    cwd: '/tmp/boxxy-test/repo',
    prompt: 'Build the item.',
    agent: 'claude',
    model: 'a-model',
    effort: 'high',
    name: 'boxxy/0190a000-0000-7000-8000-000000000001',
    idempotencyKey: '0190a000-0000-7000-8000-000000000001',
  };

  const parsed: unknown = spawnRequestSchema.safeParse(request).data;

  expect(parsed).toStrictEqual(request);
});

test('it rejects a request whose name lacks the boxxy prefix', () => {
  const request = {
    target: 'worker-host',
    cwd: '/tmp/boxxy-test/repo',
    prompt: 'Build the item.',
    agent: 'claude',
    model: 'a-model',
    effort: 'high',
    name: 'other/0190a000',
    idempotencyKey: '0190a000-0000-7000-8000-000000000001',
  };

  expect(spawnRequestSchema.safeParse(request).error?.issues).toPartiallyContain({
    path: ['name'],
  });
});
