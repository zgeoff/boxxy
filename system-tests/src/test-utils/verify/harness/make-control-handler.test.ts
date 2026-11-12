import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVerifyHarness } from './create-verify-harness.ts';
import { makeControlHandler } from './make-control-handler.ts';

async function setupTest() {
  const folder = await mkdtemp(join(tmpdir(), 'boxxy-test-control-'));

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  const harness = await createVerifyHarness(folder);

  onTestFinished(() => harness[Symbol.asyncDispose]());

  const routes = makeControlHandler(harness);

  const call = async (method: 'GET' | 'POST', path: string, body: unknown = null) => {
    const handler = routes[path]?.[method];

    if (handler === undefined) {
      return { status: 404, json: null };
    }

    const response = await handler(
      new Request(`http://control.test${path}`, {
        method,
        ...(body === null ? {} : { body: JSON.stringify(body) }),
      }),
    );

    return { status: response.status, json: await response.json() };
  };

  return { harness, call };
}

test('it answers the health route with the clock once the broker route answers', async () => {
  const ctx = await setupTest();
  const answer = await ctx.call('GET', '/control/health');

  expect(answer).toStrictEqual({
    status: 200,
    json: { clock: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/u) },
  });
});

test('it answers 409 to a claim when no item is current', async () => {
  const ctx = await setupTest();
  const answer = await ctx.call('POST', '/control/sessions/start', { queueMinutes: 0 });

  expect(answer).toStrictEqual({
    status: 409,
    json: { error: 'no current item: run file-item or land-item first' },
  });
});

test('it answers 409 to a read of the current item when none is set', async () => {
  const ctx = await setupTest();
  const answer = await ctx.call('GET', '/control/current');

  expect(answer.status).toBe(409);
});

test('it answers 400 to a body its schema refuses', async () => {
  const ctx = await setupTest();
  const answer = await ctx.call('POST', '/control/clock', { minutes: 'soon' });

  expect(answer.status).toBe(400);
});

test('it advances the clock by the minutes of the body', async () => {
  const ctx = await setupTest();

  const before = ctx.harness.server.dispatch.clock.now();

  await ctx.call('POST', '/control/clock', { minutes: 5 });

  expect(ctx.harness.server.dispatch.clock.now() - before).toBe(300_000);
});

test('it answers 409 to a merge of a pull request the forge never opened', async () => {
  const ctx = await setupTest();

  const answer = await ctx.call('POST', '/control/pull-requests/merge', {
    number: 99,
    afterMinutes: 1,
  });

  expect(answer.status).toBe(409);
});
