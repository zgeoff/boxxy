import { expect, test } from 'bun:test';
import { z } from 'zod';
import { createTestCLI } from '../src/test-utils/create-test-cli.ts';
import { readJSONOutput } from '../src/test-utils/read-json-output.ts';

async function setupTest() {
  const cli = await createTestCLI();

  const filedSchema = z.object({ item: z.string() });
  const derived = z.object({ state: z.string(), reason: z.string().optional() });
  const attempt = z.object({ phase: z.string() });
  const revision = z.object({ at: z.number(), actor: z.string(), changed: z.array(z.string()) });

  const shownSchema = z.object({
    item: z.object({ derived }),
    attempts: z.array(attempt),
    revisions: z.array(revision),
  });

  const listedItem = z.object({ id: z.string(), derived });
  const listedSchema = z.object({ items: z.array(listedItem) });

  const fileItem = async (...flags: string[]) => {
    const result = await cli.run([
      'item',
      'file',
      '--repo',
      'example/app',
      '--title',
      'Draft a dark theme',
      '--outcome',
      'The app has a dark theme.',
      ...flags,
    ]);

    return readJSONOutput(result, filedSchema).item;
  };

  const showItem = async (item: string) => {
    const shown = await cli.run(['item', 'show', item]);

    return readJSONOutput(shown, shownSchema);
  };

  return { ...cli, fileItem, showItem, listedSchema };
}

test('#item file --held files an item that a tick leaves unstarted', async () => {
  const ctx = await setupTest();
  const item = await ctx.fileItem('--held', 'still a draft');

  await ctx.server.tick();

  const shown = await ctx.showItem(item);

  expect([shown.item.derived, shown.attempts]).toStrictEqual([
    { state: 'held', reason: 'still a draft' },
    [],
  ]);
});

test('#expedite leaves a held item unstarted', async () => {
  const ctx = await setupTest();
  const item = await ctx.fileItem('--held', 'still a draft');

  await ctx.run(['expedite', item, '--reason', 'try to pull the draft']);
  await ctx.server.tick();

  const shown = await ctx.showItem(item);

  expect([shown.item.derived.state, shown.attempts]).toStrictEqual(['held', []]);
});

test('#item retry exits 1 for a held item, so its release still starts at triage', async () => {
  const ctx = await setupTest();
  const item = await ctx.fileItem('--held', 'still a draft', '--acceptance', 'It is dark.');
  const retried = await ctx.run(['item', 'retry', item, '--phase', 'build']);

  await ctx.run(['item', 'release', item]);
  await ctx.server.tick();

  const shown = await ctx.showItem(item);

  expect({ exitCode: retried.exitCode, stderr: retried.stderr }).toStrictEqual({
    exitCode: 1,
    stderr: 'error: ITEM_HELD: the item is held; release it with item_release first\n',
  });

  expect(shown.attempts).toStrictEqual([{ phase: 'triage' }]);
});

test('#item release releases a held item, and the next tick starts its triage', async () => {
  const ctx = await setupTest();
  const item = await ctx.fileItem('--held', 'still a draft');
  const released = await ctx.run(['item', 'release', item]);

  await ctx.server.tick();

  const shown = await ctx.showItem(item);

  expect(readJSONOutput(released, z.json())).toStrictEqual({ kind: 'released', item });

  expect([shown.item.derived.state, shown.attempts]).toStrictEqual([
    'running',
    [{ phase: 'triage' }],
  ]);
});

test('#item release exits 1 with a refusal for an item that is not held', async () => {
  const ctx = await setupTest();
  const item = await ctx.fileItem();
  const result = await ctx.run(['item', 'release', item]);

  expect({ exitCode: result.exitCode, stdout: result.stdout }).toStrictEqual({
    exitCode: 1,
    stdout: `${JSON.stringify({ kind: 'refused', reason: 'not-held' }, null, 2)}\n`,
  });
});

test('#item list --held lists the held items only', async () => {
  const ctx = await setupTest();
  const held = await ctx.fileItem('--held', 'still a draft');

  await ctx.fileItem();

  const listed = await ctx.run(['item', 'list', '--held']);

  expect(readJSONOutput(listed, ctx.listedSchema).items).toStrictEqual([
    { id: held, derived: { state: 'held', reason: 'still a draft' } },
  ]);
});

test('#item list exits 2 for --held with another --state', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['item', 'list', '--held', '--state', 'ready']);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 2,
    stderr: 'error: --held lists held items only, so it takes no other --state\n',
  });
});

test('#item show lists the revisions of a held item that #item edit made', async () => {
  const ctx = await setupTest();
  const item = await ctx.fileItem('--held', 'still a draft');

  await ctx.run(['item', 'edit', item, '--title', 'Draft a dark mode', '--label', 'ui']);
  await ctx.run(['item', 'note', item, '--text', 'Match the system setting.']);

  const shown = await ctx.showItem(item);

  expect([shown.item.derived.state, shown.revisions]).toStrictEqual([
    'held',
    [{ at: expect.any(Number), actor: 'boxxy:owner:local', changed: ['labels', 'title'] }],
  ]);
});
