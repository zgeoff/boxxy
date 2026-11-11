import { expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import releaseConfig from './release-please-config.json' with { type: 'json' };

test('it gives each package in apps, modules, adapters, libs and packages the release component @boxxy/<folder>', async () => {
  const listed = await Promise.all(
    ['apps', 'modules', 'adapters', 'libs', 'packages'].map(async (parent) => {
      const folders = await readdir(join(import.meta.dir, parent));

      return folders.map((folder) => [`${parent}/${folder}`, `@boxxy/${folder}`] as const);
    }),
  );

  const components = Object.entries(releaseConfig.packages).map(
    ([path, entry]) => [path, entry.component] as const,
  );

  expect(Object.fromEntries(components)).toStrictEqual(Object.fromEntries(listed.flat()));
});

test('it links every package into one version group after the workspace plugin, which skips its own merge', () => {
  const components = Object.values(releaseConfig.packages).map((entry) => entry.component);

  expect(releaseConfig.plugins).toStrictEqual([
    { type: 'node-workspace', merge: false },
    { type: 'linked-versions', groupName: 'boxxy', components: components.toSorted() },
  ]);
});
