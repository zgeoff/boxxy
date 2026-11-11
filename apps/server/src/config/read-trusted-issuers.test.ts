import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readTrustedIssuers } from './read-trusted-issuers.ts';

async function setupTest() {
  const folder = await mkdtemp(path.join(tmpdir(), 'boxxy-test-issuers-'));

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  return {
    folder,
    writeFile: async (relative: string, text: string) => {
      await mkdir(path.dirname(path.join(folder, relative)), { recursive: true });

      await Bun.write(path.join(folder, relative), text);
    },
  };
}

test('it reads every file of each folder as JSON, in name order', async () => {
  const ctx = await setupTest();

  await ctx.writeFile('east/b.json', '{"issuer":"https://b.example.test"}');
  await ctx.writeFile('east/a.json', '{"issuer":"https://a.example.test"}');
  await ctx.writeFile('west/c.json', '{"issuer":"https://c.example.test"}');

  const answer = await readTrustedIssuers([
    path.join(ctx.folder, 'east'),
    path.join(ctx.folder, 'west'),
  ]);

  expect(answer).toStrictEqual({
    kind: 'read',
    issuers: [
      { issuer: 'https://a.example.test' },
      { issuer: 'https://b.example.test' },
      { issuer: 'https://c.example.test' },
    ],
  });
});

test('it reads an empty folder as no issuer', async () => {
  const ctx = await setupTest();
  const answer = await readTrustedIssuers([ctx.folder]);

  expect(answer).toStrictEqual({ kind: 'read', issuers: [] });
});

test('it refuses a file that is not JSON, and names it', async () => {
  const ctx = await setupTest();

  await ctx.writeFile('issuer.json', 'not json');

  const answer = await readTrustedIssuers([ctx.folder]);

  expect(answer).toStrictEqual({
    kind: 'invalid',
    message: `the trust document at ${path.join(ctx.folder, 'issuer.json')} is not JSON`,
  });
});

test('it refuses a folder that does not exist, and names it', async () => {
  const ctx = await setupTest();

  const missing = path.join(ctx.folder, 'missing');

  const answer = await readTrustedIssuers([missing]);

  expect(answer).toStrictEqual({
    kind: 'invalid',
    message: `no trusted issuers folder at ${missing}`,
  });
});
