import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

test('it matches the glue that the pepys build writes for the plug-in', async () => {
  const build = Bun.spawn(
    [
      'bun',
      fileURLToPath(new URL('../node_modules/.bin/pepys', import.meta.url)),
      'build',
      fileURLToPath(new URL('boxxy-work-plugin.ts', import.meta.url)),
      '--check',
    ],
    { cwd: fileURLToPath(new URL('..', import.meta.url)), stdout: 'pipe', stderr: 'pipe' },
  );

  const [exitCode, stdout, stderr] = await Promise.all([
    build.exited,
    new Response(build.stdout).text(),
    new Response(build.stderr).text(),
  ]);

  expect({ exitCode, stdout, stderr }).toStrictEqual({
    exitCode: 0,
    stdout: '2 glue files are up to date\n',
    stderr: '',
  });
});
