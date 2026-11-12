import { expect, test } from 'bun:test';
import { collectUnresolvedImports } from './collect-unresolved-imports.ts';

function setupTest() {
  return {
    manifest: JSON.stringify({
      name: '@acme/kettle',
      dependencies: { zod: '1.0.0' },
      peerDependencies: { '@acme/lid': '1.0.0' },
      optionalDependencies: { chalk: '1.0.0' },
    }),
  };
}

test('it finds no fault when every bare import is a dependency, a peer, a builtin or the package', () => {
  const ctx = setupTest();

  const files = [
    {
      path: 'src/index.ts',
      text: [
        "import { z } from 'zod';",
        "import type { Lid } from '@acme/lid/types';",
        "import chalk from 'chalk';",
        "import { join } from 'node:path';",
        "import { Database } from 'bun:sqlite';",
        "import { file } from 'bun';",
        "import { build } from '@acme/kettle/test-utils/build';",
        "import { local } from './local.ts';",
      ].join('\n'),
    },
  ];

  expect(collectUnresolvedImports(ctx.manifest, files)).toStrictEqual([]);
});

test('it names a bare import that the manifest does not list', () => {
  const ctx = setupTest();

  const files = [
    { path: 'src/test-utils/build-mock.ts', text: "import { faker } from '@faker-js/faker';\n" },
  ];

  expect(collectUnresolvedImports(ctx.manifest, files)).toStrictEqual([
    'src/test-utils/build-mock.ts imports @faker-js/faker, which the manifest lists in no dependency field',
  ]);
});

test('it reads re-exports, side-effect imports and dynamic imports', () => {
  const ctx = setupTest();

  const files = [
    {
      path: 'src/a.ts',
      text: [
        "export { x } from 'alpha';",
        "import 'beta';",
        "const gamma = await import('gamma');",
        "export * from 'alpha';",
      ].join('\n'),
    },
  ];

  expect(collectUnresolvedImports(ctx.manifest, files)).toStrictEqual([
    'src/a.ts imports alpha, which the manifest lists in no dependency field',
    'src/a.ts imports beta, which the manifest lists in no dependency field',
    'src/a.ts imports gamma, which the manifest lists in no dependency field',
  ]);
});

test('it fails on a dev dependency, which a consumer never installs', () => {
  const manifest = JSON.stringify({
    name: '@acme/kettle',
    devDependencies: { '@acme/testing': '1.0.0' },
  });

  const files = [{ path: 'src/x.ts', text: "import { t } from '@acme/testing';\n" }];

  expect(collectUnresolvedImports(manifest, files)).toStrictEqual([
    'src/x.ts imports @acme/testing, which the manifest lists in no dependency field',
  ]);
});
