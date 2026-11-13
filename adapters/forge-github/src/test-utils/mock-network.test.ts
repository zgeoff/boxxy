import { expect, test } from 'bun:test';
import { GITHUB_API_URL } from './github-handlers.ts';

test('it answers 500 to a request to a remote host that no handler matches', async () => {
  const response = await fetch('https://unmatched.example.test/anything');

  expect(response.status).toBe(500);
});

test('it answers a request that a GitHub handler matches', async () => {
  const response = await fetch(`${GITHUB_API_URL}/repos/acme/lamps/pulls/404`);

  expect(response.status).toBe(404);
});
