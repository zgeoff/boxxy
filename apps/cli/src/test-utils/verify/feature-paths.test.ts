import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { collectFeatureScopes, isGlobMatch } from '@wringer/core';
import { collectUnmappedPaths } from './collect-unmapped-paths.ts';
import { featurePaths, ignoredPaths } from './feature-paths.ts';
import { readWorkspacePackages } from './read-workspace-packages.ts';
import { verifyRegistry } from './verify-registry.ts';

async function setupTest() {
  const rootDir = join(import.meta.dir, '..', '..', '..', '..', '..');
  const scopes = collectFeatureScopes(verifyRegistry);

  const listed = await Bun.$`git ls-files -co --exclude-standard`.cwd(rootDir).text();

  return {
    rootDir,
    featureNames: verifyRegistry.features.map((feature) => feature.name),
    repoPaths: listed.split('\n').filter((path) => path !== ''),
    readPackages: () => readWorkspacePackages(rootDir),
    isIgnored: (path: string) => isGlobMatch(path, verifyRegistry.ignore),
    collectFlagged: (path: string) =>
      isGlobMatch(path, verifyRegistry.ignore)
        ? []
        : scopes.filter((scope) => isGlobMatch(path, scope.globs)).map((scope) => scope.name),
  };
}

test.each([
  { path: 'apps/server/src/handlers/report-handlers.ts', features: ['report-cost'] },
  { path: 'apps/cli/src/commands/report-commands.ts', features: ['report-cost'] },
  { path: 'packages/pepys/src/sink/to-wire-fact.ts', features: ['report-cost'] },
  { path: 'apps/server/src/handlers/plan-handlers.ts', features: ['plan-ordering'] },
  { path: 'apps/cli/src/commands/runner-commands.ts', features: ['runner-pause'] },
  { path: 'apps/server/src/handlers/notices-handlers.ts', features: ['hold-notice'] },
  { path: 'apps/cli/src/commands/signoff-commands.ts', features: ['owner-signoff'] },
])('it flags only $features for a change to $path', async (row) => {
  const ctx = await setupTest();

  expect(ctx.collectFlagged(row.path)).toStrictEqual([...row.features]);
});

test.each([
  'apps/cli/src/hooks/run-session-start-hook.ts',
  'apps/cli/src/commands/attempt-commands.ts',
  'apps/server/src/handlers/attempt-handlers.ts',
])('it flags only the features that run a session for a change to %s', async (path) => {
  const ctx = await setupTest();

  expect(ctx.collectFlagged(path)).toStrictEqual([
    'claim-settle',
    'report-cost',
    'plan-ordering',
    'hold-notice',
    'hold-recovery',
    'owner-signoff',
  ]);
});

test.each([
  'apps/server/src/tick/run-tick.ts',
  'adapters/verifier-wringer/src/create-wringer-verifier.ts',
])('it flags only the features that tick for a change to %s', async (path) => {
  const ctx = await setupTest();

  expect(ctx.collectFlagged(path)).toStrictEqual([
    'claim-settle',
    'report-cost',
    'plan-ordering',
    'runner-pause',
    'hold-notice',
    'hold-recovery',
    'owner-signoff',
  ]);
});

test.each([
  'apps/cli/src/main.ts',
  'apps/cli/src/cli/run-cli.ts',
  'apps/cli/src/commands/item-commands.ts',
  'apps/cli/src/test-utils/verify/harness/main.ts',
  'apps/server/src/serve-api.ts',
  'apps/server/src/handlers/item-handlers.ts',
  'apps/server/src/handlers/runner-handlers.ts',
  'apps/server/src/test-utils/create-test-server.ts',
  'modules/planning/src/decide.ts',
  'modules/train/src/decide-merge.ts',
  'adapters/store-sqlite/src/index.ts',
  'adapters/auth-oauth/src/http/create-public-door.ts',
  'libs/model/src/index.ts',
  'packages/pepys/src/create-pepys-reader.ts',
])('it flags every feature for a change to the core file %s', async (path) => {
  const ctx = await setupTest();

  expect(ctx.collectFlagged(path)).toStrictEqual(ctx.featureNames);
});

test('it flags every feature for a change to a workspace file that the verify CLI loads', async () => {
  const ctx = await setupTest();

  const built = await Bun.build({
    entrypoints: [join(ctx.rootDir, 'apps', 'cli', 'src', 'test-utils', 'verify', 'verify.ts')],
    target: 'bun',
    metafile: true,
  });

  const loaded = Object.keys(built.metafile?.inputs ?? {}).filter((path) =>
    /^(?<kind>apps|modules|adapters|libs|packages)\//u.test(path),
  );

  expect(
    loaded.filter((path) => ctx.collectFlagged(path).length < ctx.featureNames.length),
  ).toStrictEqual([]);
});

test('it reaches every workspace package folder from a feature', async () => {
  const ctx = await setupTest();
  const packages = await ctx.readPackages();

  const unreached = packages
    .map((entry) => entry.folder)
    .filter((folder) => {
      const runPaths = ctx.repoPaths.filter(
        (path) => path.startsWith(`${folder}/`) && !ctx.isIgnored(path),
      );

      return runPaths.length > 0 && runPaths.every((path) => ctx.collectFlagged(path).length === 0);
    });

  expect(unreached).toStrictEqual([]);
});

test('it maps or ignores every path of the repo, so the gate fails on no unmapped path', async () => {
  const ctx = await setupTest();

  expect(collectUnmappedPaths(ctx.repoPaths, featurePaths, ignoredPaths)).toStrictEqual([]);
});

test('it ignores no source file that a journey runs', () => {
  const sources = [
    'apps/cli/src/main.ts',
    'apps/server/src/serve-api.ts',
    'modules/rules/example/prompts/build-v1.md',
    'modules/rules/example/rules.yaml',
    'modules/planning/src/decide.ts',
    'packages/pepys/src/create-pepys-reader.ts',
    'adapters/auth-oauth/src/http/create-public-door.ts',
    'adapters/verifier-wringer/src/create-wringer-verifier.ts',
  ];

  expect(collectUnmappedPaths(sources, {}, ignoredPaths)).toStrictEqual(sources);
});
