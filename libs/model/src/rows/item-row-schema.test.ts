import { expect, test } from 'bun:test';
import { itemRowSchema } from './item-row-schema.ts';

test('it accepts an item with labels, a design mode and a kept session', () => {
  const row = {
    id: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
    kind: 'core.issue',
    repo: 'acme/widgets',
    title: 'Add a retry button',
    outcome: 'A failed upload can be sent again',
    acceptance: [],
    fields: { designMode: 'attended' },
    labels: ['uploads', 'ui'],
    foundInAttempt: null,
    filedBy: 'boxxy:runner:runner-1',
    filedAt: 1000,
    closedAt: null,
    closeReason: null,
    keptSession: {
      atcSession: 'sess-01',
      target: 'worker-host',
      attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
      keptAt: 2000,
      caller: null,
    },
  };

  const parsed: unknown = itemRowSchema.safeParse(row).data;

  expect(parsed).toStrictEqual(row);
});

test('it rejects an item filed by an actor that boxxy has no name for', () => {
  expect(itemRowSchema.safeParse({ filedBy: 'someone' }).error?.issues).toPartiallyContain({
    path: ['filedBy'],
  });
});
