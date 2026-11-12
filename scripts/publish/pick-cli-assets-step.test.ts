import { expect, test } from 'bun:test';
import { pickCLIAssetsStep } from './pick-cli-assets-step.ts';

test('it builds the assets for the release tag of the CLI when a publish releases the CLI', () => {
  const step = pickCLIAssetsStep({
    mode: 'publish',
    paths: { kind: 'listed', paths: ['apps/cli', 'libs/model'] },
    manifest: {
      kind: 'public',
      folder: '/tmp/boxxy-test/apps/cli',
      name: '@boxxy/cli',
      version: '0.2.0',
      hasBuild: true,
      releasedVersion: '0.2.0',
    },
  });

  expect(step).toStrictEqual({ kind: 'build', version: '0.2.0', uploadTag: '@boxxy/cli@0.2.0' });
});

test('it builds the assets with no upload in a rehearsal of the workspace', () => {
  const step = pickCLIAssetsStep({
    mode: 'rehearse',
    paths: { kind: 'workspace' },
    manifest: {
      kind: 'public',
      folder: '/tmp/boxxy-test/apps/cli',
      name: '@boxxy/cli',
      version: '0.2.0',
      hasBuild: true,
      releasedVersion: undefined,
    },
  });

  expect(step).toStrictEqual({ kind: 'build', version: '0.2.0', uploadTag: null });
});

test('it builds the assets for a republish by hand, which names no released versions', () => {
  const step = pickCLIAssetsStep({
    mode: 'publish',
    paths: { kind: 'listed', paths: ['apps/cli'] },
    manifest: {
      kind: 'public',
      folder: '/tmp/boxxy-test/apps/cli',
      name: '@boxxy/cli',
      version: '0.1.9',
      hasBuild: true,
      releasedVersion: undefined,
    },
  });

  expect(step).toStrictEqual({ kind: 'build', version: '0.1.9', uploadTag: '@boxxy/cli@0.1.9' });
});

test.each(['publish', 'rehearse'] as const)(
  'it skips the assets in a %s whose paths leave the CLI out',
  (mode) => {
    const step = pickCLIAssetsStep({
      mode,
      paths: { kind: 'listed', paths: ['libs/model'] },
      manifest: {
        kind: 'public',
        folder: '/tmp/boxxy-test/apps/cli',
        name: '@boxxy/cli',
        version: '0.2.0',
        hasBuild: true,
        releasedVersion: undefined,
      },
    });

    expect(step).toStrictEqual({
      kind: 'skip',
      message: 'skipping the CLI assets: the run does not release apps/cli\n',
    });
  },
);

test('it refuses a released version that the manifest at the tag does not hold', () => {
  const step = pickCLIAssetsStep({
    mode: 'publish',
    paths: { kind: 'listed', paths: ['apps/cli'] },
    manifest: {
      kind: 'public',
      folder: '/tmp/boxxy-test/apps/cli',
      name: '@boxxy/cli',
      version: '0.2.0',
      hasBuild: true,
      releasedVersion: '0.3.0',
    },
  });

  expect(step).toStrictEqual({
    kind: 'refused',
    message: 'the release tagged apps/cli at 0.3.0, but its package.json holds 0.2.0',
  });
});

test('it refuses a manifest that names no package and version', () => {
  const step = pickCLIAssetsStep({
    mode: 'publish',
    paths: { kind: 'listed', paths: ['apps/cli'] },
    manifest: { kind: 'invalid', message: 'apps/cli/package.json names no package and version' },
  });

  expect(step).toStrictEqual({
    kind: 'refused',
    message: 'apps/cli/package.json names no package and version',
  });
});

test('it refuses a private CLI package, which has no release to attach to', () => {
  const step = pickCLIAssetsStep({
    mode: 'publish',
    paths: { kind: 'listed', paths: ['apps/cli'] },
    manifest: { kind: 'private', folder: '/tmp/boxxy-test/apps/cli', name: '@boxxy/cli' },
  });

  expect(step).toStrictEqual({
    kind: 'refused',
    message: '@boxxy/cli is private, so no release carries its assets',
  });
});
