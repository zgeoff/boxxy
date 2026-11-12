import { expect, test } from 'bun:test';
import { verifyCloseOutSchema } from './verify-close-out-schema.ts';

test('it accepts a failed verify with its failing features', () => {
  const closeOut = {
    result: { kind: 'failed', features: ['upload-retry'] },
    session: 'builder',
    friction: [],
    frictionDropped: 0,
  };

  const parsed: unknown = verifyCloseOutSchema.safeParse(closeOut).data;

  expect(parsed).toStrictEqual(closeOut);
});

test('it rejects a failed verify that names no feature', () => {
  const closeOut = {
    result: { kind: 'failed', features: [] },
    session: 'fresh',
    friction: [],
    frictionDropped: 0,
  };

  expect(verifyCloseOutSchema.safeParse(closeOut).error?.issues).toPartiallyContain({
    path: ['result', 'features'],
  });
});

test('it rejects a verify with no grader session', () => {
  const closeOut = { result: { kind: 'verified' }, friction: [], frictionDropped: 0 };

  expect(verifyCloseOutSchema.safeParse(closeOut).error?.issues).toPartiallyContain({
    path: ['session'],
  });
});
