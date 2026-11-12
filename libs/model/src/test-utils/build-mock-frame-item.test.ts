import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockFrameItem } from './build-mock-frame-item.ts';

test('it builds a ready item at the build phase of round 1', () => {
  const built: unknown = buildMockFrameItem();

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
    phase: 'build',
    round: 1,
  });
});

test('it gives the position the phase and round of the overrides', () => {
  const built: unknown = buildMockFrameItem({
    title: 'Trim the log output',
    phase: brandSchemas.phaseName.parse('review'),
    round: 2,
  });

  expect(built).toStrictEqual(
    expect.objectContaining({
      title: 'Trim the log output',
      position: { kind: 'phase', phase: 'review', round: 2 },
      phase: 'review',
      round: 2,
    }),
  );
});
