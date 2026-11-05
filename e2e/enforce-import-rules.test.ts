import { expect, onTestFinished, test } from 'bun:test';
import { cp, mkdtemp, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

// Each check runs in a copy of the workspace beside this file, so a bad fixture never enters the
// real workspace, where it would fail every run of the checks.
async function setupTest() {
  const repoRoot = join(import.meta.dir, '..');

  const workspace = await mkdtemp(join(import.meta.dir, '.test-import-rules-'));

  onTestFinished(() => rm(workspace, { recursive: true, force: true }));

  const copied = [
    'package.json',
    'bun.lock',
    'turbo.json',
    '.oxlintrc.json',
    'test-utils/package.json',
    'e2e/package.json',
    'adapters/store-sqlite',
    'libs/model',
    'modules/dispatch',
  ];

  for (const path of copied) {
    await cp(join(repoRoot, path), join(workspace, path), {
      recursive: true,
      filter: (source) => !source.includes('node_modules'),
    });
  }

  await symlink(join(repoRoot, 'node_modules'), join(workspace, 'node_modules'));

  const addModule = (fixture: string) =>
    cp(
      join(import.meta.dir, 'fixtures/bad-imports', fixture),
      join(workspace, 'modules', fixture),
      { recursive: true },
    );

  const runCheck = async (argv: readonly string[]) => {
    const result = await $`${argv}`
      .cwd(workspace)
      .env({ PATH: process.env['PATH'], HOME: workspace, TURBO_TELEMETRY_DISABLED: '1' })
      .nothrow()
      .quiet();

    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  };

  const runBoundaries = () => runCheck([join(repoRoot, 'node_modules/.bin/turbo'), 'boundaries']);

  // oxlint skips a folder walk under a dot folder, such as this copy's, so the test names each file
  const runLint = (paths: readonly string[]) =>
    runCheck([join(repoRoot, 'node_modules/.bin/oxlint'), ...paths]);

  return { addModule, runBoundaries, runLint };
}

test('it passes turbo boundaries and oxlint on the workspace with no bad module', async () => {
  const ctx = await setupTest();
  const boundaries = await ctx.runBoundaries();

  const lint = await ctx.runLint([
    'modules/dispatch/src/index.ts',
    'modules/dispatch/src/package-name.ts',
  ]);

  expect(boundaries.exitCode).toBe(0);
  expect(lint.exitCode).toBe(0);
});

test('it fails turbo boundaries on a module that imports an adapter', async () => {
  const ctx = await setupTest();

  await ctx.addModule('module-imports-adapter');

  const boundaries = await ctx.runBoundaries();

  expect(boundaries.exitCode).toBe(1);
  expect(boundaries.stdout + boundaries.stderr).toContain('@boxxy/module-imports-adapter');
  expect(boundaries.stdout + boundaries.stderr).toContain('1 issue found');
});

test('it fails oxlint on a module that imports bun:sqlite', async () => {
  const ctx = await setupTest();

  await ctx.addModule('module-imports-sqlite');

  const lint = await ctx.runLint(['modules/module-imports-sqlite/src/index.ts']);

  expect(lint.exitCode).toBe(1);

  expect(lint.stdout).toContain(
    'zgeoff(import-zones): sqlite: bun:sqlite is allowed only in store-sqlite',
  );

  expect(lint.stdout).toContain('modules/module-imports-sqlite/src/index.ts:1:1');
});
