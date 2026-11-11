import { expect, test } from 'bun:test';
import { buildMockCLIDeps } from './build-mock-cli-deps.ts';

test('it keeps the environment it is given and reads an empty stdin', async () => {
  const deps = buildMockCLIDeps({ BOXXY_URL: 'http://boxxy.test' });

  const stdin = await deps.readStdin();

  expect([deps.env, stdin]).toStrictEqual([{ BOXXY_URL: 'http://boxxy.test' }, '']);
});
