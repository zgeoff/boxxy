import { expect, test } from 'bun:test';
import { gitSourceSchema, spawnRequestSchema } from './spawn-request-schema.ts';

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

test('it accepts a stored spawn request with a git source in place of a folder', () => {
  const request = {
    target: 'worker-host',
    source: { url: 'https://git.example.test/example/app.git', ref: 'main' },
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

test.each([
  [
    'both a folder and a git source',
    {
      cwd: '/tmp/boxxy-test/repo',
      source: { url: 'https://git.example.test/a.git', ref: 'main' },
    },
  ],
  ['neither a folder nor a git source', {}],
])('it rejects a request with %s', (_title, place) => {
  const request = {
    target: 'worker-host',
    ...place,
    prompt: 'Build the item.',
    agent: 'claude',
    model: 'a-model',
    effort: 'high',
    name: 'boxxy/0190a000-0000-7000-8000-000000000001',
    idempotencyKey: '0190a000-0000-7000-8000-000000000001',
  };

  expect(spawnRequestSchema.safeParse(request).success).toBeFalse();
});

test.each([
  ['a URL with a credential', { url: 'https://user:secret@git.example.test/a.git', ref: 'main' }],
  [
    'a ref that reads as an option',
    { url: 'https://git.example.test/a.git', ref: '--upload-pack' },
  ],
  [
    'a credential field',
    { url: 'https://git.example.test/a.git', ref: 'main', credentialEnv: 'EXAMPLE_GIT_TOKEN' },
  ],
])('#gitSourceSchema rejects %s', (_title, source) => {
  expect(gitSourceSchema.safeParse(source).success).toBeFalse();
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
