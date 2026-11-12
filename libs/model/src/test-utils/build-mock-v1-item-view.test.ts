import { expect, test } from 'bun:test';
import { buildMockV1ItemView } from './build-mock-v1-item-view.ts';

test('it builds a ready item at the build phase of round 1', () => {
  const built: unknown = buildMockV1ItemView();

  expect(built).toStrictEqual({
    id: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    kind: 'core.issue',
    repo: expect.stringMatching(/^[\w.-]+\/[\w.-]+$/u),
    title: expect.any(String),
    outcome: expect.any(String),
    body: '',
    acceptance: [{ id: 'a1', text: expect.any(String), evidence: [] }],
    fields: {},
    labels: [],
    foundInAttempt: null,
    filedBy: 'boxxy:owner:local',
    filedAt: expect.any(Number),
    closedAt: null,
    closeReason: null,
    keptSession: null,
    derived: { state: 'ready' },
    position: { kind: 'phase', phase: 'build', round: 1 },
  });
});

test('it applies overrides on top of the defaults', () => {
  const item = buildMockV1ItemView({ labels: ['uploads'] });

  expect(item).toStrictEqual(expect.objectContaining({ labels: ['uploads'] }));
});
