import { expect, test } from 'bun:test';
import { positionSchema } from './position-schema.ts';

test.each([
  { kind: 'phase', phase: 'build', round: 2 },
  { kind: 'end', reason: 'reviewed' },

  // oxlint-disable-next-line unicorn/no-thenable -- `then` is a field of the position, never awaited
  { kind: 'hold', reason: 'declined', then: 'triage', round: 1 },
])('it accepts a position of kind $kind', (position) => {
  const parsed: unknown = positionSchema.safeParse(position).data;

  expect(parsed).toStrictEqual(position);
});

test('it rejects a phase position with a round of zero', () => {
  const position = { kind: 'phase', phase: 'build', round: 0 };

  expect(positionSchema.safeParse(position).error?.issues).toPartiallyContain({
    path: ['round'],
  });
});
