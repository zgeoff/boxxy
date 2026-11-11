import { expect, test } from 'bun:test';
import { waitFor } from './wait-for.ts';

test('it resolves once the check turns true', async () => {
  let calls = 0;

  await waitFor(() => {
    calls += 1;

    return calls === 3;
  });

  expect(calls).toBe(3);
});

test('it throws when the check stays false past the timeout', () => {
  expect(waitFor(() => false, 20)).rejects.toThrow('stayed false for 20 ms');
});
