import { expect, test } from 'bun:test';
import { collectUnshippedExports } from './collect-unshipped-exports.ts';

function setupTest() {
  return {
    kettleEntries: [
      'package/package.json',
      'package/src/index.ts',
      'package/src/test-utils/build-mock-lid.ts',
      'package/dist/index.d.ts',
    ],
  };
}

test('it finds no fault in a package that ships every export target', () => {
  const ctx = setupTest();

  const manifest = JSON.stringify({
    exports: {
      '.': { types: './dist/index.d.ts', default: './src/index.ts' },
      './test-utils/*': './src/test-utils/*.ts',
    },
  });

  expect(collectUnshippedExports(manifest, ctx.kettleEntries)).toStrictEqual([]);
});

test('it names an export whose target the tarball does not hold', () => {
  const ctx = setupTest();

  const manifest = JSON.stringify({
    exports: {
      '.': { default: './src/index.ts' },
      './sink': './src/sink.ts',
    },
  });

  expect(collectUnshippedExports(manifest, ctx.kettleEntries)).toStrictEqual([
    'the export "./sink" names ./src/sink.ts, which the tarball does not hold',
  ]);
});

test('it names a pattern export whose files the tarball leaves out', () => {
  const ctx = setupTest();

  const manifest = JSON.stringify({
    exports: { './test-utils/*': './src/test-utils/*.ts' },
  });

  const shipped = ctx.kettleEntries.filter((entry) => !entry.includes('/test-utils/'));

  expect(collectUnshippedExports(manifest, shipped)).toStrictEqual([
    'the export "./test-utils/*" names ./src/test-utils/*.ts, which the tarball does not hold',
  ]);
});

test('it names a target that sits in a nested condition', () => {
  const ctx = setupTest();

  const manifest = JSON.stringify({
    exports: { '.': { node: { import: './src/node.ts' }, default: './src/index.ts' } },
  });

  expect(collectUnshippedExports(manifest, ctx.kettleEntries)).toStrictEqual([
    'the export "." names ./src/node.ts, which the tarball does not hold',
  ]);
});

test('it checks the entry of a package whose exports is one string', () => {
  const ctx = setupTest();
  const manifest = JSON.stringify({ exports: './src/missing.ts' });

  expect(collectUnshippedExports(manifest, ctx.kettleEntries)).toStrictEqual([
    'the export "." names ./src/missing.ts, which the tarball does not hold',
  ]);
});

test('it skips a blocked export and a manifest with no exports', () => {
  const ctx = setupTest();

  expect(
    collectUnshippedExports(
      JSON.stringify({ exports: { './internal/*': null } }),
      ctx.kettleEntries,
    ),
  ).toStrictEqual([]);

  expect(
    collectUnshippedExports(JSON.stringify({ name: 'kettle' }), ctx.kettleEntries),
  ).toStrictEqual([]);
});

test('it fails the manifest of @boxxy/pepys, which names test-utils and leaves them out', () => {
  const manifest = JSON.stringify({
    files: ['src', '!src/**/*.test.ts', '!src/test-utils', 'dist'],
    exports: {
      '.': { types: './dist/index.d.ts', default: './src/index.ts' },
      './test-utils/*': './src/test-utils/*.ts',
    },
  });

  const packed = [
    'package/package.json',
    'package/src/index.ts',
    'package/src/sink/to-wire-fact.ts',
    'package/dist/index.d.ts',
  ];

  expect(collectUnshippedExports(manifest, packed)).toStrictEqual([
    'the export "./test-utils/*" names ./src/test-utils/*.ts, which the tarball does not hold',
  ]);
});
