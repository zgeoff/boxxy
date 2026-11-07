import { expect, test } from 'bun:test';
import { buildMockItemView } from './build-mock-item-view.ts';

test('it builds a default item view', () => {
  const built: unknown = buildMockItemView();

  expect(built).toStrictEqual({
    id: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    kind: 'core.issue',
    repo: expect.stringMatching(/^[a-z]+\/[a-z]+$/iu),
    title: expect.any(String),
    outcome: expect.any(String),
    acceptance: [{ id: 'a1', text: expect.any(String), evidence: [] }],
    foundInAttempt: null,
    filedBy: 'boxxy:owner:local',
    filedAt: expect.any(Number),
    closedAt: null,
    closeReason: null,
    derived: { state: 'ready' },
  });
});

test('it applies overrides on top of the defaults', () => {
  const item = buildMockItemView({ title: 'Add a retry button', derived: { state: 'idea' } });

  expect(item).toStrictEqual(
    expect.objectContaining({ title: 'Add a retry button', derived: { state: 'idea' } }),
  );
});
