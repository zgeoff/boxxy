import { expect, test } from 'bun:test';
import { countUnrelatedLines } from './count-unrelated-lines.ts';

test.each([
  ['no changed file', [], ['src/upload.ts'], 0],
  [
    'changes only in files with findings',
    [{ path: 'src/upload.ts', changedLines: 12 }],
    ['src/upload.ts'],
    0,
  ],
  [
    'changes outside the files with findings',
    [
      { path: 'src/upload.ts', changedLines: 12 },
      { path: 'src/theme.ts', changedLines: 5 },
      { path: 'docs/upload.md', changedLines: 3 },
    ],
    ['src/upload.ts'],
    8,
  ],
  [
    'an earlier review with no finding',
    [
      { path: 'src/upload.ts', changedLines: 12 },
      { path: 'src/theme.ts', changedLines: 5 },
    ],
    [],
    17,
  ],
  [
    'a file named twice in the finding paths',
    [{ path: 'src/upload.ts', changedLines: 4 }],
    ['src/upload.ts', 'src/upload.ts'],
    0,
  ],
  [
    'a path that differs only in case',
    [{ path: 'src/Upload.ts', changedLines: 4 }],
    ['src/upload.ts'],
    4,
  ],
])('it counts the unrelated lines of %s', (_title, changed, findingPaths, expected) => {
  expect(countUnrelatedLines(changed, findingPaths)).toBe(expected);
});
