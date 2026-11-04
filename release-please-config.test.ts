import { expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import releaseConfig from './release-please-config.json' with { type: 'json' };

test('it gives each package in apps, modules, adapters and libs the release component @boxxy/<folder>', async () => {
  const listed = await Promise.all(
    ['apps', 'modules', 'adapters', 'libs'].map(async (parent) => {
      const folders = await readdir(join(import.meta.dir, parent));

      return folders.map((folder) => [`${parent}/${folder}`, `@boxxy/${folder}`] as const);
    }),
  );

  const components = Object.entries(releaseConfig.packages).map(
    ([path, entry]) => [path, entry.component] as const,
  );

  expect(components.toSorted()).toStrictEqual(listed.flat().toSorted());
});
