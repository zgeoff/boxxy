import { expect, test } from 'bun:test';
import type { CommandResult } from '../ci/run-command.ts';
import type { RegistryAnswer } from './parse-registry-answer.ts';
import { parseRegistryAnswer } from './parse-registry-answer.ts';

test.each<readonly [string, CommandResult, RegistryAnswer]>([
  ['the version npm holds', { exitCode: 0, stdout: '0.4.0\n', stderr: '' }, { kind: 'published' }],
  [
    'no output for a version npm lacks',
    { exitCode: 0, stdout: '', stderr: '' },
    { kind: 'missing' },
  ],
  [
    'E404 for a package npm lacks',
    { exitCode: 1, stdout: '', stderr: 'npm error code E404\nnpm error 404 Not Found\n' },
    { kind: 'missing' },
  ],
  [
    'a network failure',
    { exitCode: 1, stdout: '', stderr: 'npm error code ETIMEDOUT\n' },
    {
      kind: 'failed',
      message: 'npm view @acme/kettle@0.4.0 version failed: npm error code ETIMEDOUT',
    },
  ],
  [
    'a failure with no error text',
    { exitCode: 7, stdout: '', stderr: '' },
    { kind: 'failed', message: 'npm view @acme/kettle@0.4.0 version failed: exit 7' },
  ],
])('it reads %s', (_label, result, expected) => {
  expect(parseRegistryAnswer(result, '@acme/kettle@0.4.0', '0.4.0')).toStrictEqual(expected);
});
