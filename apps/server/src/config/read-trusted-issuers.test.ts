import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
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
    writeSymlink: async (relative: string, target: string) => {
      await mkdir(path.dirname(path.join(folder, relative)), { recursive: true });
      await symlink(target, path.join(folder, relative));
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

test('it reads each document of a Kubernetes ConfigMap volume once, through its symlinks', async () => {
  const ctx = await setupTest();

  await ctx.writeFile(
    'mount/..2026_11_12_00_00_00.123/a.json',
    '{"issuer":"https://a.example.test"}',
  );

  await ctx.writeFile(
    'mount/..2026_11_12_00_00_00.123/b.json',
    '{"issuer":"https://b.example.test"}',
  );

  await ctx.writeSymlink('mount/..data', '..2026_11_12_00_00_00.123');
  await ctx.writeSymlink('mount/b.json', '..data/b.json');
  await ctx.writeSymlink('mount/a.json', '..data/a.json');

  const answer = await readTrustedIssuers([path.join(ctx.folder, 'mount')]);

  expect(answer).toStrictEqual({
    kind: 'read',
    issuers: [{ issuer: 'https://a.example.test' }, { issuer: 'https://b.example.test' }],
  });
});

test('it skips each entry whose name starts with two dots, a file or a symlink that points nowhere', async () => {
  const ctx = await setupTest();

  await ctx.writeFile('a.json', '{"issuer":"https://a.example.test"}');
  await ctx.writeFile('..stale.json', '{"issuer":"https://stale.example.test"}');
  await ctx.writeSymlink('..data_tmp', '..2026_11_12_00_00_00.456');

  const answer = await readTrustedIssuers([ctx.folder]);

  expect(answer).toStrictEqual({
    kind: 'read',
    issuers: [{ issuer: 'https://a.example.test' }],
  });
});

test('it skips a sub-folder and a symlink to a folder', async () => {
  const ctx = await setupTest();

  await ctx.writeFile('issuers/a.json', '{"issuer":"https://a.example.test"}');
  await ctx.writeFile('issuers/nested/b.json', '{"issuer":"https://b.example.test"}');
  await ctx.writeSymlink('issuers/linked', 'nested');

  const answer = await readTrustedIssuers([path.join(ctx.folder, 'issuers')]);

  expect(answer).toStrictEqual({
    kind: 'read',
    issuers: [{ issuer: 'https://a.example.test' }],
  });
});

test('it refuses a symlink that points nowhere, and names it', async () => {
  const ctx = await setupTest();

  await ctx.writeFile('a.json', '{"issuer":"https://a.example.test"}');
  await ctx.writeSymlink('b.json', 'missing.json');

  const answer = await readTrustedIssuers([ctx.folder]);

  expect(answer).toStrictEqual({
    kind: 'invalid',
    message: `the trust document at ${path.join(ctx.folder, 'b.json')} points nowhere`,
  });
});

test('it refuses folders that hold no document, and names them', async () => {
  const ctx = await setupTest();

  await ctx.writeFile('east/nested/a.json', '{"issuer":"https://a.example.test"}');

  await mkdir(path.join(ctx.folder, 'west'));

  const east = path.join(ctx.folder, 'east');
  const west = path.join(ctx.folder, 'west');

  const answer = await readTrustedIssuers([east, west]);

  expect(answer).toStrictEqual({
    kind: 'invalid',
    message: `no trust document in ${east}, ${west}`,
  });
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
