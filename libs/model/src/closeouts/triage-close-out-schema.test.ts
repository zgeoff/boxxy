import { expect, test } from 'bun:test';
import { triageCloseOutSchema } from './triage-close-out-schema.ts';

test('it accepts an accepted triage that sets the kind, the design mode and the acceptance', () => {
  const closeOut = {
    result: { kind: 'accepted' },
    set: {
      kind: 'core.issue',
      designMode: 'attended',
      acceptance: [{ text: 'A failed upload shows a retry button' }],
    },
    relations: [{ type: 'blocks', target: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77' }],
    friction: [],
    frictionDropped: 0,
  };

  const parsed: unknown = triageCloseOutSchema.safeParse(closeOut).data;

  expect(parsed).toStrictEqual(closeOut);
});

test('it accepts a triage that sets a body of 40,000 characters', () => {
  const closeOut = {
    result: { kind: 'accepted' },
    set: { body: 'b'.repeat(40_000) },
    relations: [],
    friction: [],
    frictionDropped: 0,
  };

  const parsed: unknown = triageCloseOutSchema.safeParse(closeOut).data;

  expect(parsed).toStrictEqual(closeOut);
});

test('it rejects a triage that sets a body of 40,001 characters', () => {
  const closeOut = {
    result: { kind: 'accepted' },
    set: { body: 'b'.repeat(40_001) },
    relations: [],
    friction: [],
    frictionDropped: 0,
  };

  expect(triageCloseOutSchema.safeParse(closeOut).error?.issues).toPartiallyContain({
    path: ['set', 'body'],
  });
});

test('it rejects a duplicate with no item it duplicates', () => {
  const closeOut = {
    result: { kind: 'duplicate' },
    relations: [],
    friction: [],
    frictionDropped: 0,
  };

  expect(triageCloseOutSchema.safeParse(closeOut).error?.issues).toPartiallyContain({
    path: ['result', 'of'],
  });
});

test('it rejects a key that no triage close-out has', () => {
  const closeOut = {
    result: { kind: 'accepted' },
    relations: [],
    criteria: [],
    friction: [],
    frictionDropped: 0,
  };

  expect(triageCloseOutSchema.safeParse(closeOut).success).toBe(false);
});
