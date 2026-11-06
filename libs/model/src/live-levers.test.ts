import { expect, test } from 'bun:test';
import { brandSchemas } from './brand-schemas.ts';
import { liveLevers } from './live-levers.ts';
import { buildMockLeverRow } from './test-utils/build-mock-lever-row.ts';

test('it drops a defer that a later undefer on the same item undoes', () => {
  const item = brandSchemas.itemId.parse('0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77');
  const defer = buildMockLeverRow({ seq: 1, item, kind: 'plan.defer' });
  const undefer = buildMockLeverRow({ seq: 2, item, kind: 'plan.undefer', reason: null });

  expect(liveLevers([defer, undefer], brandSchemas.instant.parse(5000))).toStrictEqual([undefer]);
});

test('it drops an expedite that a later unexpedite on the same item undoes', () => {
  const item = brandSchemas.itemId.parse('0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77');
  const expedite = buildMockLeverRow({ seq: 1, item, kind: 'plan.expedite' });
  const unexpedite = buildMockLeverRow({ seq: 2, item, kind: 'plan.unexpedite', reason: null });

  expect(liveLevers([expedite, unexpedite], brandSchemas.instant.parse(5000))).toStrictEqual([
    unexpedite,
  ]);
});

test('it drops an expedite at its expiry time', () => {
  const expedite = buildMockLeverRow({
    kind: 'plan.expedite',
    expiresAt: brandSchemas.instant.parse(5000),
  });

  expect(liveLevers([expedite], brandSchemas.instant.parse(5000))).toStrictEqual([]);
});

test('it keeps an expedite before its expiry time', () => {
  const expedite = buildMockLeverRow({
    kind: 'plan.expedite',
    expiresAt: brandSchemas.instant.parse(5001),
  });

  expect(liveLevers([expedite], brandSchemas.instant.parse(5000))).toStrictEqual([expedite]);
});

test('it keeps a defer that an undefer written before it does not undo', () => {
  const item = brandSchemas.itemId.parse('0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77');
  const undefer = buildMockLeverRow({ seq: 1, item, kind: 'plan.undefer', reason: null });
  const defer = buildMockLeverRow({ seq: 2, item, kind: 'plan.defer' });

  expect(liveLevers([undefer, defer], brandSchemas.instant.parse(5000))).toStrictEqual([
    undefer,
    defer,
  ]);
});

test('it keeps a defer that an undefer on another item does not undo', () => {
  const defer = buildMockLeverRow({
    seq: 1,
    item: brandSchemas.itemId.parse('0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77'),
    kind: 'plan.defer',
  });

  const undefer = buildMockLeverRow({
    seq: 2,
    item: brandSchemas.itemId.parse('0192f0c4-7b1f-7c22-8e01-6a4b2d9f1c30'),
    kind: 'plan.undefer',
    reason: null,
  });

  expect(liveLevers([defer, undefer], brandSchemas.instant.parse(5000))).toStrictEqual([
    defer,
    undefer,
  ]);
});
