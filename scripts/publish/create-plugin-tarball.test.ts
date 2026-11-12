import { expect, onTestFinished, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, rm, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import { runCommand } from '../ci/run-command.ts';
import { writeTreeFiles } from '../test-utils/write-tree-files.ts';
import { createPluginTarball } from './create-plugin-tarball.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-create-plugin-tarball-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const create = async (name: string) => {
    const packageFolder = join(directory, name, 'package');
    const outDir = join(directory, name, 'out');

    await mkdir(outDir, { recursive: true });

    return {
      packageFolder,
      run: () =>
        createPluginTarball({
          runCommand,
          packageFolder,
          outDir,
          env: { PATH: process.env['PATH'] },
        }),
    };
  };

  return { create };
}

test('it packs the plug-in folder under hook-plugin/, with its hidden folder', async () => {
  const ctx = await setupTest();
  const copy = await ctx.create('one');

  await writeTreeFiles(copy.packageFolder, {
    'hook-plugin/.claude-plugin/plugin.json': '{"name":"boxxy"}\n',
    'hook-plugin/hooks/hooks.json': '{"hooks":{}}\n',
  });

  const tarball = await copy.run();
  const listing = await $`tar -tzf ${tarball}`.quiet().text();

  expect(listing.split('\n').filter(Boolean)).toStrictEqual([
    'hook-plugin/',
    'hook-plugin/.claude-plugin/',
    'hook-plugin/.claude-plugin/plugin.json',
    'hook-plugin/hooks/',
    'hook-plugin/hooks/hooks.json',
  ]);
});

test('it packs the same bytes from two copies with other times and modes', async () => {
  const ctx = await setupTest();
  const first = await ctx.create('first');
  const second = await ctx.create('second');

  const files = {
    'hook-plugin/.claude-plugin/plugin.json': '{"name":"boxxy"}\n',
    'hook-plugin/hooks/hooks.json': '{"hooks":{}}\n',
  };

  await writeTreeFiles(first.packageFolder, files);
  await writeTreeFiles(second.packageFolder, files);
  await utimes(join(second.packageFolder, 'hook-plugin/hooks/hooks.json'), 1_000_000, 1_000_000);
  await chmod(join(second.packageFolder, 'hook-plugin/hooks/hooks.json'), 0o664);
  await chmod(join(second.packageFolder, 'hook-plugin/hooks'), 0o775);

  const firstTarball = await first.run();
  const secondTarball = await second.run();
  const firstBytes = await readFile(firstTarball);
  const secondBytes = await readFile(secondTarball);

  expect(secondBytes.equals(firstBytes)).toBeTrue();
});
