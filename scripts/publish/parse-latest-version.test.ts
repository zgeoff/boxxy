import { expect, test } from 'bun:test';
import type { CommandResult } from '../ci/run-command.ts';
import type { LatestVersion } from './parse-latest-version.ts';
import { parseLatestVersion } from './parse-latest-version.ts';

test.each<readonly [string, CommandResult, LatestVersion]>([
  [
    'the latest version',
    { exitCode: 0, stdout: '0.2.0\n', stderr: '' },
    { kind: 'found', version: '0.2.0' },
  ],
  [
    'no output for a package with no latest tag',
    { exitCode: 0, stdout: '', stderr: '' },
    { kind: 'none' },
  ],
  [
    'E404 for a package npm lacks',
    { exitCode: 1, stdout: '', stderr: 'npm error code E404\n' },
    { kind: 'none' },
  ],
  [
    'a network failure',
    { exitCode: 1, stdout: '', stderr: 'npm error code ETIMEDOUT\n' },
    {
      kind: 'failed',
      message: 'npm view @acme/kettle dist-tags.latest failed: npm error code ETIMEDOUT',
    },
  ],
])('it reads %s', (_label, result, expected) => {
  expect(parseLatestVersion(result, '@acme/kettle')).toStrictEqual(expected);
});
