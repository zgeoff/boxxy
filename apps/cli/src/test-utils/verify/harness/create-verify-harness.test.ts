import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HttpClient } from '@wringer/http';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { runCLI } from '../../../cli/run-cli.ts';
import { runGit } from '../../../run-git.ts';
import { postControl } from '../post-control.ts';
import { runBoxxy } from '../run-boxxy.ts';
import type { VerifyContext } from '../verify-context.ts';
import { controlRoutes } from './control-routes.ts';
import { createVerifyHarness } from './create-verify-harness.ts';
import { fileClosedItem } from './file-closed-item.ts';
import { fileItem } from './file-item.ts';
import { landItem } from './land-item.ts';
import { makeControlHandler } from './make-control-handler.ts';
import { readItemByTitle } from './read-item-by-title.ts';
import { readSessionItem } from './read-session-item.ts';
import { runPlanLever } from './run-plan-lever.ts';
import { runSession } from './run-session.ts';
import { serveHarness } from './serve-harness.ts';
import { costSchema, itemShowSchema, statusSchema, timesSchema } from './types.ts';

// The journeys of the verify CLI, run against the harness in this process. The CLI steps run the
// real CLI in this process too, on the argv that `bun verify` runs as a process: `env BOXXY_URL=…
// BOXXY_SKILLS_URL=… bun <cli> <args>`, since a process start per step outruns the test's limit.
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
    exec: (argv, options) => {
      const words = argv.slice(1);

      const env = Object.fromEntries(
        words
          .slice(0, 2)
          .map((word) => [word.slice(0, word.indexOf('=')), word.slice(word.indexOf('=') + 1)]),
      );

      return runCLI(
        {
          env,
          readStdin: () => Promise.resolve(options?.stdin ?? ''),
          readFile: (path) => readFile(path, 'utf8'),
          runGit,
          sleep: () => Promise.resolve(),
          now: () => Date.now(),
        },
        words.slice(4),
      );
    },
    endpoints: { web: listeners.control, boxxy: listeners.boxxy, skills: harness.skillsURL },
    drivers: { http: { request: sendControlRequest } },
  };

  const showItem = () =>
    runBoxxy(ctx, { argv: ['item', 'show', '@current'], schema: itemShowSchema });

  const showItemTitled = async (title: string) => {
    const id = await readItemByTitle(ctx, title);

    return runBoxxy(ctx, { argv: ['item', 'show', id], schema: itemShowSchema });
  };

  return { ctx, showItem, showItemTitled };
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

test('it lets the session find the closed item when the journey runs a second time', async () => {
  const ctx = await setupTest();

  await fileClosedItem(ctx.ctx, { title: 'Read the theme from the desktop' });
  await fileItem(ctx.ctx, { title: 'Read the system theme' });
  await runSession(ctx.ctx, { closeOut: 'accepted', minutes: 4 });
  await fileClosedItem(ctx.ctx, { title: 'Read the theme from the desktop' });
  await fileItem(ctx.ctx, { title: 'Read the system theme' });
  await runSession(ctx.ctx, { closeOut: 'accepted', minutes: 4 });

  const shown = await readSessionItem(ctx.ctx, {
    text: 'theme from the desktop',
    title: 'Read the theme from the desktop',
  });

  expect(shown.item.title).toBe('Read the theme from the desktop');
});

test('it fails the session read with check-failed when the shown title differs', async () => {
  const ctx = await setupTest();

  await fileClosedItem(ctx.ctx, { title: 'Read the theme from the desktop' });
  await fileItem(ctx.ctx, { title: 'Read the system theme' });
  await runSession(ctx.ctx, { closeOut: 'accepted', minutes: 4 });

  const read = readSessionItem(ctx.ctx, { text: 'theme from the desktop', title: 'Another title' });

  expect(read).rejects.toMatchObject({ code: 'check-failed' });
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

test('it claims the expedited item and not the deferred one, and claims the deferred one after the undefer', async () => {
  const ctx = await setupTest();

  await fileItem(ctx.ctx, { title: 'Sort the settings by use' });
  await fileItem(ctx.ctx, { title: 'Sort the settings by name', keepPrevious: true });
  await runPlanLever(ctx.ctx, { lever: 'expedite', title: 'Sort the settings by name' });
  await runPlanLever(ctx.ctx, { lever: 'defer', title: 'Sort the settings by use' });
  await runSession(ctx.ctx, { closeOut: 'accepted', minutes: 4 });

  const expedited = await ctx.showItemTitled('Sort the settings by name');
  const deferred = await ctx.showItemTitled('Sort the settings by use');

  await runPlanLever(ctx.ctx, { lever: 'undefer', title: 'Sort the settings by use' });
  await postControl(ctx.ctx, controlRoutes.tick, null);

  const undeferred = await ctx.showItemTitled('Sort the settings by use');

  expect([expedited.attempts, deferred.attempts, undeferred.attempts]).toStrictEqual([
    [{ phase: 'triage', state: 'succeeded', outcome: 'accepted' }],
    [],
    [{ phase: 'triage', state: expect.any(String), outcome: null }],
  ]);
});

test('it closes the peer of a journey when the next journey files its item', async () => {
  const ctx = await setupTest();

  await fileItem(ctx.ctx, { title: 'Sort the settings by use' });
  await fileItem(ctx.ctx, { title: 'Sort the settings by name', keepPrevious: true });
  await fileItem(ctx.ctx, { title: 'Remember the window size' });

  const first = await ctx.showItemTitled('Sort the settings by use');
  const second = await ctx.showItemTitled('Sort the settings by name');
  const third = await ctx.showItem();

  expect([first, second, third].map((shown) => shown.item.derived.state)).toStrictEqual([
    'archived',
    'archived',
    'ready',
  ]);
});

test('it claims nothing while the runner is paused, and claims the item after the resume', async () => {
  const ctx = await setupTest();

  const pause = () => runBoxxy(ctx.ctx, { argv: ['runner', 'pause'], schema: statusSchema });
  const resume = () => runBoxxy(ctx.ctx, { argv: ['runner', 'resume'], schema: statusSchema });

  await pause();
  await fileItem(ctx.ctx, { title: 'Remember the window size' });
  await postControl(ctx.ctx, controlRoutes.tick, null);

  const paused = await ctx.showItem();

  await resume();
  await postControl(ctx.ctx, controlRoutes.tick, null);

  const resumed = await ctx.showItem();

  expect([paused.attempts, resumed.attempts.map((attempt) => attempt.phase)]).toStrictEqual([
    [],
    ['triage'],
  ]);
});

test('it sends one notice to the registered session when an item holds', async () => {
  const ctx = await setupTest();

  await runBoxxy(ctx.ctx, {
    argv: ['notices', 'register', 'workbench.3.owner-notes'],
    schema: z.unknown(),
  });

  await fileItem(ctx.ctx, { title: 'Choose the theme source' });
  await runSession(ctx.ctx, { closeOut: 'needs-owner', minutes: 4 });
  await postControl(ctx.ctx, controlRoutes.tick, null);

  const shown = await ctx.showItem();
  const sent = await postControl(ctx.ctx, controlRoutes.readNotices, null);

  expect({ reason: shown.item.derived.reason, notices: sent.notices }).toStrictEqual({
    reason: 'needs-owner',
    notices: [{ item: shown.item.id, reason: 'needs-owner', session: 'workbench.3.owner-notes' }],
  });
});

test('it sends no notice while no session is registered', async () => {
  const ctx = await setupTest();

  await fileItem(ctx.ctx, { title: 'Choose the theme source' });
  await runSession(ctx.ctx, { closeOut: 'needs-owner', minutes: 4 });
  await postControl(ctx.ctx, controlRoutes.tick, null);

  const sent = await postControl(ctx.ctx, controlRoutes.readNotices, null);

  expect(sent.notices).toStrictEqual([]);
});

test('it lifts the hold of a blocked build and runs a passed review after the retry', async () => {
  const ctx = await setupTest();

  await fileItem(ctx.ctx, { title: 'Pick the theme in the settings' });
  await runSession(ctx.ctx, { closeOut: 'accepted', minutes: 4 });
  await runSession(ctx.ctx, { closeOut: 'designed', minutes: 10 });

  const opened = await postControl(ctx.ctx, controlRoutes.openPullRequest, null);

  await runSession(ctx.ctx, { closeOut: 'blocked', minutes: 12, pullRequest: opened.number });

  const held = await ctx.showItem();

  await runBoxxy(ctx.ctx, {
    argv: ['item', 'retry', '@current', '--phase', 'review'],
    schema: z.unknown(),
  });

  const review = await runSession(ctx.ctx, { closeOut: 'passed', minutes: 8 });
  const shown = await ctx.showItem();

  expect({
    heldReason: held.item.derived.reason,
    review: [review.phase, review.state, review.outcome],
    reasonAfter: shown.item.derived.reason,
  }).toStrictEqual({
    heldReason: 'blocked',
    review: ['review', 'succeeded', 'passed'],
    reasonAfter: 'no pull request linked',
  });
});
