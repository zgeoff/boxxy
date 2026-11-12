import { expect, test } from 'bun:test';
import { formatChecksums } from './format-checksums.ts';

test('it writes one sha256sum line for each file, with two spaces before the bare name', () => {
  const text = formatChecksums([
    { name: 'boxxy-linux-x64', sha256: 'a'.repeat(64) },
    { name: 'boxxy-hook-plugin.tar.gz', sha256: 'b'.repeat(64) },
  ]);

  expect(text).toBe(
    `${'a'.repeat(64)}  boxxy-linux-x64\n${'b'.repeat(64)}  boxxy-hook-plugin.tar.gz\n`,
  );
});
