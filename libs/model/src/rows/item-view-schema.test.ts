import { expect, test } from 'bun:test';
import { itemViewSchema } from './item-view-schema.ts';

test.each([{ state: 'running' }, { state: 'waiting', reason: 'pull request open' }])(
  'it accepts an item view in the state $state',
  (derived) => {
    const view = {
      id: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
      kind: 'core.issue',
      repo: 'acme/widgets',
      title: 'Add a retry button',
      outcome: 'A failed upload can be sent again',
      acceptance: [],
      fields: {},
      labels: [],
      foundInAttempt: null,
      filedBy: 'boxxy:owner:local',
      filedAt: 1000,
      closedAt: null,
      closeReason: null,
      keptSession: null,
      derived,
      position: { kind: 'phase', phase: 'build', round: 1 },
    };

    const parsed: unknown = itemViewSchema.safeParse(view).data;

    expect(parsed).toStrictEqual(view);
  },
);

test('it rejects a waiting item view with no reason', () => {
  const view = {
    id: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
    kind: 'core.issue',
    repo: 'acme/widgets',
    title: 'Add a retry button',
    outcome: 'A failed upload can be sent again',
    acceptance: [],
    fields: {},
    labels: [],
    foundInAttempt: null,
    filedBy: 'boxxy:owner:local',
    filedAt: 1000,
    closedAt: null,
    closeReason: null,
    keptSession: null,
    derived: { state: 'waiting' },
    position: { kind: 'phase', phase: 'build', round: 1 },
  };

  expect(itemViewSchema.safeParse(view).error?.issues).toPartiallyContain({
    path: ['derived', 'reason'],
  });
});
