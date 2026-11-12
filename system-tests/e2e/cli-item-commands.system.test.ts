import { expect, test } from 'bun:test';
import { z } from 'zod';
import { createTestCLI } from '../src/test-utils/create-test-cli.ts';
import { readJSONOutput } from '../src/test-utils/read-json-output.ts';

async function setupTest() {
  const cli = await createTestCLI();

  const filedSchema = z.object({ item: z.string() });
  const position = z.object({ kind: z.string(), phase: z.string().optional(), round: z.number() });
  const derived = z.object({ state: z.string() });
  const labels = z.array(z.string());
  const shownItem = z.object({ title: z.string(), labels, derived, position });
  const note = z.object({ text: z.string() });
  const relation = z.object({ source: z.string(), type: z.string(), target: z.string() });

  const shownSchema = z.object({
    item: shownItem,
    notes: z.array(note),
    relations: z.array(relation),
  });

  const listedItem = z.object({ labels });
  const listedSchema = z.object({ items: z.array(listedItem), next: z.string().nullable() });

  const fileItem = async (...flags: string[]) => {
    const result = await cli.run([
      'item',
      'file',
      '--repo',
      'example/app',
      '--title',
      'Follow the system theme',
      '--outcome',
      'The app follows the system theme.',
      ...flags,
    ]);

    return { result, item: readJSONOutput(result, filedSchema).item };
  };

  return { ...cli, fileItem, filedSchema, shownSchema, listedSchema };
}

test('#item file files an item that #item show then reads back', async () => {
  const ctx = await setupTest();

  const filed = await ctx.fileItem(
    '--acceptance',
    'The theme follows the system.',
    '--label',
    'ui',
  );

  const shown = await ctx.run(['item', 'show', filed.item]);

  expect({ exitCode: filed.result.exitCode, stderr: filed.result.stderr }).toStrictEqual({
    exitCode: 0,
    stderr: '',
  });

  expect(readJSONOutput(shown, ctx.shownSchema).item).toStrictEqual({
    title: 'Follow the system theme',
    labels: ['ui'],
    derived: { state: 'ready' },
    position: { kind: 'phase', phase: 'triage', round: 1 },
  });
});

test('#item file exits 2 and files nothing when --title is missing', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['item', 'file', '--repo', 'example/app', '--outcome', 'Done.']);
  const listed = await ctx.run(['item', 'list']);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 2,
    stderr: 'error: missing --title\n',
  });

  expect(readJSONOutput(listed, ctx.listedSchema)).toStrictEqual({ items: [], next: null });
});

test('#item edit changes the fields it is given and keeps the others', async () => {
  const ctx = await setupTest();
  const filed = await ctx.fileItem('--label', 'ui');
  const edited = await ctx.run(['item', 'edit', filed.item, '--title', 'Follow the OS theme']);
  const shown = await ctx.run(['item', 'show', filed.item]);

  expect(readJSONOutput(edited, ctx.filedSchema)).toStrictEqual({ item: filed.item });

  expect(readJSONOutput(shown, ctx.shownSchema).item).toStrictEqual({
    title: 'Follow the OS theme',
    labels: ['ui'],
    derived: { state: 'ready' },
    position: { kind: 'phase', phase: 'triage', round: 1 },
  });
});

test('#item list lists only the items with the label', async () => {
  const ctx = await setupTest();

  await ctx.fileItem('--label', 'ui');
  await ctx.fileItem('--label', 'infra');

  const listed = await ctx.run(['item', 'list', '--label', 'infra', '--limit', '5']);

  expect(readJSONOutput(listed, ctx.listedSchema)).toStrictEqual({
    items: [{ labels: ['infra'] }],
    next: null,
  });
});

test('#item list exits 2 for a state that does not exist', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['item', 'list', '--state', 'sleepy']);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 2,
    stderr: 'error: --state takes one of: idea, ready, blocked, running, waiting, done, archived\n',
  });
});

test('#item note appends a note that #item show lists', async () => {
  const ctx = await setupTest();
  const filed = await ctx.fileItem();
  const noted = await ctx.run(['item', 'note', filed.item, '--text', 'Ask the owner first.']);
  const shown = await ctx.run(['item', 'show', filed.item]);

  expect(readJSONOutput(noted, z.json())).toStrictEqual({ item: filed.item, seq: 1 });

  expect(readJSONOutput(shown, ctx.shownSchema).notes).toStrictEqual([
    { text: 'Ask the owner first.' },
  ]);
});

test('#item close closes an item that #item show then reports as archived', async () => {
  const ctx = await setupTest();
  const filed = await ctx.fileItem();
  const closed = await ctx.run(['item', 'close', filed.item, '--reason', 'no longer wanted']);
  const shown = await ctx.run(['item', 'show', filed.item]);

  expect(readJSONOutput(closed, z.json())).toStrictEqual({ item: filed.item, ended: [] });
  expect(readJSONOutput(shown, ctx.shownSchema).item.derived.state).toBe('archived');
});

test('#item close with --of adds a duplicate-of relation to the other item', async () => {
  const ctx = await setupTest();
  const first = await ctx.fileItem();
  const second = await ctx.fileItem();

  await ctx.run(['item', 'close', second.item, '--reason', 'duplicate', '--of', first.item]);

  const shown = await ctx.run(['item', 'show', second.item]);

  expect(readJSONOutput(shown, ctx.shownSchema).relations).toStrictEqual([
    { source: second.item, type: 'duplicate-of', target: first.item },
  ]);
});

test('#item retry sends the item to the given phase', async () => {
  const ctx = await setupTest();
  const filed = await ctx.fileItem();
  const retried = await ctx.run(['item', 'retry', filed.item, '--phase', 'build']);
  const shown = await ctx.run(['item', 'show', filed.item]);

  expect(readJSONOutput(retried, z.json())).toStrictEqual({ lever: expect.any(Number) });

  expect(readJSONOutput(shown, ctx.shownSchema).item.position).toStrictEqual({
    kind: 'phase',
    phase: 'build',
    round: 2,
  });
});

test('#item retry exits 1 and names the code for a phase the pipeline lacks', async () => {
  const ctx = await setupTest();
  const filed = await ctx.fileItem();
  const result = await ctx.run(['item', 'retry', filed.item, '--phase', 'ship']);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 1,
    stderr: 'error: UNKNOWN_PHASE: the pipeline of the item has no such phase\n',
  });
});

test('#item file exits 1 and names the repo that the server configuration does not name', async () => {
  const ctx = await setupTest();

  const result = await ctx.run([
    'item',
    'file',
    '--repo',
    'example/widget',
    '--title',
    'Check a widget',
    '--outcome',
    'The widget passes.',
  ]);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 1,
    stderr:
      'error: REPO_NOT_CONFIGURED: the server configuration names no such repository ' +
      '{"repo":"example/widget"}\n',
  });
});

test('#item wake answers not-sleeping for an item with no sleeping attempt', async () => {
  const ctx = await setupTest();
  const filed = await ctx.fileItem();
  const result = await ctx.run(['item', 'wake', filed.item]);

  expect(readJSONOutput(result, z.json())).toStrictEqual({ kind: 'not-sleeping' });
});

test('#item show exits 1 and names the item that does not exist', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['item', 'show', 'i-404']);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 1,
    stderr: 'error: NOT_FOUND: no such item {"item":"i-404"}\n',
  });
});
