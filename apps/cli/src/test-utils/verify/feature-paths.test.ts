import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { collectUnmappedPaths } from './collect-unmapped-paths.ts';
import { featurePaths, ignoredPaths } from './feature-paths.ts';

test('it maps or ignores every path of the repo, so the gate fails on no unmapped path', async () => {
  const listed = await Bun.$`git ls-files -co --exclude-standard`
    .cwd(join(import.meta.dir, '..', '..', '..', '..', '..'))
    .text();

  const paths = listed.split('\n').filter((path) => path !== '');

  expect(collectUnmappedPaths(paths, featurePaths, ignoredPaths)).toStrictEqual([]);
});

test('it ignores no source file that a journey runs', () => {
  const sources = [
    'apps/cli/src/main.ts',
    'apps/server/src/serve-api.ts',
    'modules/rules/example/prompts/build-v1.md',
    'modules/rules/example/rules.yaml',
    'modules/planning/src/decide.ts',
    'packages/pepys/src/reader.ts',
  ];

  expect(collectUnmappedPaths(sources, {}, ignoredPaths)).toStrictEqual(sources);
});
