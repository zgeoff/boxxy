import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProcess } from '@wringer/core';
import type { HttpClient } from '@wringer/http';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { createVerifyHarness } from '../src/test-utils/verify/harness/create-verify-harness.ts';
import { fileClosedItem } from '../src/test-utils/verify/harness/file-closed-item.ts';
import { fileItem } from '../src/test-utils/verify/harness/file-item.ts';
import { landItem } from '../src/test-utils/verify/harness/land-item.ts';
import { makeControlHandler } from '../src/test-utils/verify/harness/make-control-handler.ts';
import { readSessionItem } from '../src/test-utils/verify/harness/read-session-item.ts';
import { runSession } from '../src/test-utils/verify/harness/run-session.ts';
import { serveHarness } from '../src/test-utils/verify/harness/serve-harness.ts';
import { costSchema, itemShowSchema, timesSchema } from '../src/test-utils/verify/harness/types.ts';
import { runBoxxy } from '../src/test-utils/verify/run-boxxy.ts';
import type { VerifyContext } from '../src/test-utils/verify/verify-context.ts';

// The journeys of the verify CLI, run against the harness in this process. The CLI steps run the
// real CLI as a process, as `bun verify` does.
async function setupTest() {
  const folder = await mkdtemp(join(tmpdir(), 'boxxy-test-verify-'));

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  const harness = await createVerifyHarness(folder);

  onTestFinished(() => harness[Symbol.asyncDispose]());

  const listeners = await serveHarness(harness);

  const routes = makeControlHandler(harness);

  const sendControlRequest: HttpClient['request'] = async (request) => {
    const method = request.method ?? 'GET';
    const handler = routes[request.path]?.[method === 'POST' ? 'POST' : 'GET'];

    invariant(handler !== undefined, `the control routes serve ${method} ${request.path}`);

    const response = await handler(
      new Request(`http://control.test${request.path}`, {
        method,
        ...(request.json === undefined ? {} : { body: JSON.stringify(request.json) }),
      }),
    );

    const body = await response.text();

    return { status: response.status, headers: {}, body, json: JSON.parse(body) };
  };

  onTestFinished(() => listeners.stop());

  const ctx: VerifyContext = {
    exec: (argv, options) =>
      runProcess({ argv, ...(options?.stdin === undefined ? {} : { stdin: options.stdin }) }),
    endpoints: { web: listeners.control, boxxy: listeners.boxxy, skills: harness.skillsURL },
    drivers: { http: { request: sendControlRequest } },
  };

  const showItem = () =>
    runBoxxy(ctx, { argv: ['item', 'show', '@current'], schema: itemShowSchema });

  return { ctx, showItem };
}

test('it files an item that item show reads back', async () => {
  const ctx = await setupTest();

  await fileItem(ctx.ctx, { title: 'Follow the system theme' });

  const shown = await ctx.showItem();

  expect(shown.item.title).toBe('Follow the system theme');
});

test('it settles a triage attempt as succeeded with the outcome accepted', async () => {
  const ctx = await setupTest();

  await fileItem(ctx.ctx, { title: 'Read the system theme' });

  const session = await runSession(ctx.ctx, { closeOut: 'accepted', minutes: 4 });
  const shown = await ctx.showItem();

  expect({ session, attempts: shown.attempts }).toStrictEqual({
    session: { id: expect.any(String), phase: 'triage', state: 'succeeded', outcome: 'accepted' },
    attempts: [{ phase: 'triage', state: 'succeeded', outcome: 'accepted' }],
  });
});

test('it lets the session of a triage attempt find and read a closed item of its repo', async () => {
  const ctx = await setupTest();
  const closed = await fileClosedItem(ctx.ctx, { title: 'Read the theme from the desktop' });

  await fileItem(ctx.ctx, { title: 'Read the system theme' });
  await runSession(ctx.ctx, { closeOut: 'accepted', minutes: 4 });

  const shown = await readSessionItem(ctx.ctx, {
    text: 'theme from the desktop',
    title: 'Read the theme from the desktop',
  });

  expect(shown.item).toStrictEqual({ id: closed.item, title: 'Read the theme from the desktop' });
});

test('it fails the session read with check-failed when the shown title differs', async () => {
  const ctx = await setupTest();

  await fileClosedItem(ctx.ctx, { title: 'Read the theme from the desktop' });
  await fileItem(ctx.ctx, { title: 'Read the system theme' });
  await runSession(ctx.ctx, { closeOut: 'accepted', minutes: 4 });

  const read = readSessionItem(ctx.ctx, { text: 'theme from the desktop', title: 'Another title' });

  await expect(read).rejects.toMatchObject({ code: 'check-failed' });
});

test('it reports 2 requests and 3 USD, a build of 30 minutes and a merge of 20 for a landed item', async () => {
  const ctx = await setupTest();

  await landItem(ctx.ctx, { title: 'Show the theme in the header' });

  const cost = await runBoxxy(ctx.ctx, { argv: ['cost', '@current'], schema: costSchema });
  const times = await runBoxxy(ctx.ctx, { argv: ['times', '@current'], schema: timesSchema });

  expect({
    totals: cost.totals,
    build: times.steps.find((row) => row.step === 'build')?.minutes,
    merge: times.steps.find((row) => row.step === 'merge')?.minutes,
  }).toStrictEqual({ totals: { requests: 2, costUSD: 3 }, build: 30, merge: 20 });
});

test('it runs the journeys in any order on one harness', async () => {
  const ctx = await setupTest();

  await landItem(ctx.ctx, { title: 'First landing' });
  await fileItem(ctx.ctx, { title: 'Then a filing' });
  await runSession(ctx.ctx, { closeOut: 'accepted', minutes: 4 });
  await landItem(ctx.ctx, { title: 'Second landing' });

  const cost = await runBoxxy(ctx.ctx, { argv: ['cost', '@current'], schema: costSchema });

  expect(z.number().parse(cost.totals.costUSD)).toBe(3);
});
