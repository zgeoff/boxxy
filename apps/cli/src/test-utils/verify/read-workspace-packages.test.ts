import { expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir } from '@zgeoff/testing/fs';
import { readWorkspacePackages } from './read-workspace-packages.ts';

function setupTest() {
  const rootDir = createTempDir('boxxy-workspace-packages-').path;

  return {
    rootDir,
    writeJSON: (path: string, value: unknown) => {
      mkdirSync(join(rootDir, path, '..'), { recursive: true });
      writeFileSync(join(rootDir, path), JSON.stringify(value));
    },
  };
}

test('it reads each workspace package with only its run-time workspace dependencies', async () => {
  const ctx = setupTest();

  ctx.writeJSON('package.json', { workspaces: { packages: ['modules/*', 'libs/*'] } });

  ctx.writeJSON('modules/kettle/package.json', {
    name: '@boxxy/kettle',
    dependencies: { '@boxxy/clock': 'workspace:*', zod: 'catalog:' },
    devDependencies: { '@boxxy/teapot': 'workspace:*' },
  });

  ctx.writeJSON('libs/clock/package.json', { name: '@boxxy/clock' });
  ctx.writeJSON('docs/package.json', { name: '@boxxy/docs' });

  const packages = await readWorkspacePackages(ctx.rootDir);

  expect(packages).toStrictEqual([
    { folder: 'libs/clock', name: '@boxxy/clock', workspaceDependencies: [] },
    { folder: 'modules/kettle', name: '@boxxy/kettle', workspaceDependencies: ['@boxxy/clock'] },
  ]);
});
