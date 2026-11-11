import { expect, test } from 'bun:test';
import { buildCloseOutSchema } from './build-close-out-schema.ts';

test('it accepts a built close-out with cited evidence, an open item and friction', () => {
  const closeOut = {
    result: { kind: 'built' },
    criteria: [{ criterion: 'a1', evidence: '0192f0c5-3c4d-7e5f-a061-7b8c9d0e1f2a' }],
    openItems: [
      { kind: 'core.issue', title: 'Retry a failed download', body: 'Downloads fail too' },
    ],
    friction: [
      { target: { kind: 'lint', name: 'max-nested-calls' }, change: 'Allow 4 in schemas' },
    ],
    frictionDropped: 1,
  };

  const built: unknown = buildCloseOutSchema.safeParse(closeOut).data;

  expect(built).toStrictEqual(closeOut);
});

test('it accepts an abandoned close-out with its reason', () => {
  const closeOut = {
    result: { kind: 'abandoned', reason: 'The upload service is gone' },
    criteria: [],
    openItems: [],
    friction: [],
    frictionDropped: 0,
  };

  const parsed: unknown = buildCloseOutSchema.safeParse(closeOut).data;

  expect(parsed).toStrictEqual(closeOut);
});

test('it rejects an abandoned result with no reason', () => {
  const closeOut = {
    result: { kind: 'abandoned' },
    criteria: [],
    openItems: [],
    friction: [],
    frictionDropped: 0,
  };

  expect(buildCloseOutSchema.safeParse(closeOut).error?.issues).toPartiallyContain({
    path: ['result', 'reason'],
  });
});

test.each([-1, 0.5])('it rejects a frictionDropped count of %p', (frictionDropped) => {
  const closeOut = {
    result: { kind: 'built' },
    criteria: [],
    openItems: [],
    friction: [],
    frictionDropped,
  };

  expect(buildCloseOutSchema.safeParse(closeOut).error?.issues).toPartiallyContain({
    path: ['frictionDropped'],
  });
});

test('it rejects a blocked result with no reason', () => {
  const closeOut = {
    result: { kind: 'blocked' },
    criteria: [],
    openItems: [],
    friction: [],
    frictionDropped: 0,
  };

  expect(buildCloseOutSchema.safeParse(closeOut).error?.issues).toPartiallyContain({
    path: ['result', 'reason'],
  });
});

test('it rejects an open item of a kind other than core.issue', () => {
  const closeOut = {
    result: { kind: 'built' },
    criteria: [],
    openItems: [
      { kind: 'core.idea', title: 'Retry a failed download', body: 'Downloads fail too' },
    ],
    friction: [],
    frictionDropped: 0,
  };

  expect(buildCloseOutSchema.safeParse(closeOut).error?.issues).toPartiallyContain({
    path: ['openItems', 0, 'kind'],
  });
});
