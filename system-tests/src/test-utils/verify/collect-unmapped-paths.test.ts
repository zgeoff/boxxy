import { expect, test } from 'bun:test';
import { collectUnmappedPaths } from './collect-unmapped-paths.ts';

test('#collectUnmappedPaths keeps a path that no feature glob and no ignore glob matches', () => {
  const unmapped = collectUnmappedPaths(
    ['apps/cli/src/main.ts', 'docs/design/a.md', 'adapters/new-thing/src/index.ts'],
    { 'file-item': ['apps/cli/**'] },
    ['docs/**'],
  );

  expect(unmapped).toStrictEqual(['adapters/new-thing/src/index.ts']);
});

test('#collectUnmappedPaths returns nothing when every path is mapped or ignored', () => {
  const unmapped = collectUnmappedPaths(
    ['apps/cli/src/main.ts', 'docs/design/a.md'],
    { 'file-item': ['apps/cli/**'], 'report-cost': ['packages/pepys/**'] },
    ['docs/**'],
  );

  expect(unmapped).toStrictEqual([]);
});
