import { expect, test } from 'bun:test';
import { callerWait } from '../constants.ts';
import { createClient } from '../create-client.ts';
import { buildMockCLIDeps } from '../test-utils/build-mock-cli-deps.ts';
import { waitForAttempt } from './wait-for-attempt.ts';

// `answers` is what the server returns to each call of `attempt.current`, in order; the last one
// repeats.
function setupTest(answers: readonly unknown[]) {
  const slept: number[] = [];
  let calls = 0;

  const send = (): Promise<Response> => {
    const answer = answers[Math.min(calls, answers.length - 1)];

    calls += 1;

    return Promise.resolve(Response.json({ json: answer }));
  };

  const deps = {
    ...buildMockCLIDeps({ BOXXY_URL: 'http://boxxy.test' }),
    send,
    sleep: (durationMs: number) => {
      slept.push(durationMs);

      return Promise.resolve();
    },
  };

  return { slept, wait: () => waitForAttempt(createClient(deps), deps), calls: () => calls };
}

test('it returns the attempt at once when the server has one', async () => {
  const ctx = setupTest([{ kind: 'attempt', attempt: { id: 'a-1' } }]);

  const current = await ctx.wait();

  expect({ id: String(current?.attempt.id), slept: ctx.slept }).toStrictEqual({
    id: 'a-1',
    slept: [],
  });
});

test('it asks again after a pause until the server has an attempt', async () => {
  const ctx = setupTest([
    { kind: 'no-attempt' },
    { kind: 'no-attempt' },
    { kind: 'attempt', attempt: { id: 'a-2' } },
  ]);

  const current = await ctx.wait();

  expect({ id: String(current?.attempt.id), slept: ctx.slept }).toStrictEqual({
    id: 'a-2',
    slept: [callerWait.delayMs, callerWait.delayMs],
  });
});

test('it returns null after the last try without a pause behind it', async () => {
  const ctx = setupTest([{ kind: 'no-attempt' }]);

  const current = await ctx.wait();

  expect({ current, calls: ctx.calls(), pauses: ctx.slept.length }).toStrictEqual({
    current: null,
    calls: callerWait.tries,
    pauses: callerWait.tries - 1,
  });
});
