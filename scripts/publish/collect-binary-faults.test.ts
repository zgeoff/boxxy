import { expect, test } from 'bun:test';
import { collectBinaryFaults } from './collect-binary-faults.ts';

test('it finds no fault in a binary that answers each check as the CLI does', () => {
  const faults = collectBinaryFaults({
    version: '0.2.0',
    versionRun: { exitCode: 0, stdout: '0.2.0\n', stderr: '' },
    helpRun: {
      exitCode: 0,
      stdout: 'usage: boxxy <command> [flags]\n\nboxxy item list\n',
      stderr: '',
    },
    hookRun: { exitCode: 2, stdout: '', stderr: 'error: BOXXY_URL is not set\n' },
    checksumRun: { exitCode: 0, stdout: 'boxxy-linux-x64: OK\n', stderr: '' },
  });

  expect(faults).toStrictEqual([]);
});

test('it names each check that a broken binary fails', () => {
  const faults = collectBinaryFaults({
    version: '0.2.0',
    versionRun: { exitCode: 0, stdout: '0.0.0\n', stderr: '' },
    helpRun: { exitCode: 1, stdout: '', stderr: 'Segmentation fault\n' },
    hookRun: { exitCode: 1, stdout: '', stderr: 'TypeError: undefined is not an object\n' },
    checksumRun: { exitCode: 1, stdout: 'boxxy-linux-x64: FAILED\n', stderr: '' },
  });

  expect(faults).toStrictEqual([
    String.raw`boxxy-linux-x64 --version printed "0.0.0\n", not "0.2.0\n"`,
    'boxxy-linux-x64 --help exited 1, not 0 with the usage line: Segmentation fault',
    'boxxy-linux-x64 hook session-start with no BOXXY_URL exited 1, not 2 with "error: BOXXY_URL is not set": TypeError: undefined is not an object',
    'sha256sum -c SHA256SUMS exited 1: boxxy-linux-x64: FAILED',
  ]);
});

test('it names a version check that exits nonzero even when the output matches', () => {
  const faults = collectBinaryFaults({
    version: '0.2.0',
    versionRun: { exitCode: 1, stdout: '0.2.0\n', stderr: '' },
    helpRun: { exitCode: 0, stdout: 'usage: boxxy <command> [flags]\n', stderr: '' },
    hookRun: { exitCode: 2, stdout: '', stderr: 'error: BOXXY_URL is not set\n' },
    checksumRun: { exitCode: 0, stdout: 'boxxy-linux-x64: OK\n', stderr: '' },
  });

  expect(faults).toStrictEqual(['boxxy-linux-x64 --version exited 1, not 0']);
});
