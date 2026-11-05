import { expect, test } from 'bun:test';
import { parsePackageManifest } from './parse-package-manifest.ts';

test('it reads a public package with its version, build script and released version', () => {
  const manifest = parsePackageManifest(
    JSON.stringify({ name: '@acme/kettle', version: '1.2.0', scripts: { build: 'tsc' } }),
    '/repo/libs/kettle',
    '1.2.0',
  );

  expect(manifest).toStrictEqual({
    kind: 'public',
    folder: '/repo/libs/kettle',
    name: '@acme/kettle',
    version: '1.2.0',
    hasBuild: true,
    releasedVersion: '1.2.0',
  });
});

test('it reads a public package with no build script', () => {
  const manifest = parsePackageManifest(
    JSON.stringify({ name: '@acme/kettle', version: '1.2.0' }),
    '/repo/libs/kettle',
    undefined,
  );

  expect(manifest).toStrictEqual({
    kind: 'public',
    folder: '/repo/libs/kettle',
    name: '@acme/kettle',
    version: '1.2.0',
    hasBuild: false,
    releasedVersion: undefined,
  });
});

test('it reads a private package that holds no version as private', () => {
  const manifest = parsePackageManifest(
    JSON.stringify({ name: 'kettle-workspace', private: true }),
    '/repo',
    undefined,
  );

  expect(manifest).toStrictEqual({ kind: 'private', folder: '/repo', name: 'kettle-workspace' });
});

test('it names a private package with no name by its folder', () => {
  const manifest = parsePackageManifest(JSON.stringify({ private: true }), '/repo', undefined);

  expect(manifest).toStrictEqual({ kind: 'private', folder: '/repo', name: '/repo' });
});

test('it refuses a public package with no version', () => {
  const manifest = parsePackageManifest(
    JSON.stringify({ name: '@acme/kettle' }),
    '/repo/libs/kettle',
    undefined,
  );

  expect(manifest).toStrictEqual({
    kind: 'invalid',
    message: '/repo/libs/kettle/package.json names no package and version',
  });
});

test('it refuses a package.json that holds no JSON object', () => {
  const manifest = parsePackageManifest('"kettle"', '/repo/libs/kettle', undefined);

  expect(manifest).toStrictEqual({
    kind: 'invalid',
    message: '/repo/libs/kettle/package.json holds no JSON object',
  });
});

test('it refuses a package.json that is not JSON', () => {
  const manifest = parsePackageManifest('{ "name": ', '/repo/libs/kettle', undefined);

  expect(manifest).toStrictEqual({
    kind: 'invalid',
    message: '/repo/libs/kettle/package.json holds no JSON object',
  });
});
