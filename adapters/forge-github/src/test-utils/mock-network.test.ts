import { expect, test } from 'bun:test';
import { GITHUB_API_URL } from './github-handlers.ts';

test('it answers a request that a GitHub handler matches', async () => {
  const response = await fetch(`${GITHUB_API_URL}/repos/acme/lamps/pulls/404`);

  expect(response.status).toBe(404);
});
