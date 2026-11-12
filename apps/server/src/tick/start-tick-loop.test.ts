import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '../test-utils/wait-for.ts';
import { startTickLoop } from './start-tick-loop.ts';

function setupTest() {
  const logged: string[] = [];

  return {
    logged,
    log: { warn: (message: string) => logged.push(message) },
  };
}

test('it runs the next tick after the interval', async () => {
  const ctx = setupTest();
  let ticks = 0;

  const loop = startTickLoop({
    runOnce: () => {
      ticks += 1;

      return Promise.resolve();
    },
    intervalMs: 5,
    failureMessage: 'the test tick failed',
    log: ctx.log,
  });

  onTestFinished(() => loop.stop());

  await waitFor(() => ticks >= 3);

  expect(ticks).toBeGreaterThanOrEqual(3);
});

test('it logs a tick that throws with its failure message and runs the next one', async () => {
  const ctx = setupTest();
  let ticks = 0;

  const loop = startTickLoop({
    runOnce: () => {
      ticks += 1;

      return ticks === 1 ? Promise.reject(new Error('the store is locked')) : Promise.resolve();
    },
    intervalMs: 5,
    failureMessage: 'the test tick failed',
    log: ctx.log,
  });

  onTestFinished(() => loop.stop());

  await waitFor(() => ticks >= 2);

  expect(ctx.logged[0]).toBe('the test tick failed');
});

test('it runs no tick after the stop', async () => {
  const ctx = setupTest();
  let ticks = 0;

  const loop = startTickLoop({
    runOnce: () => {
      ticks += 1;

      return Promise.resolve();
    },
    intervalMs: 60_000,
    failureMessage: 'the test tick failed',
    log: ctx.log,
  });

  onTestFinished(() => loop.stop());

  await loop.stop();

  expect(ticks).toBe(1);
});
