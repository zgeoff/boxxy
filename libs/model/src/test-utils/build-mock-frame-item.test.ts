import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockFrameItem } from './build-mock-frame-item.ts';

test('it builds a ready item view in the build phase', () => {
  const built: unknown = buildMockFrameItem();

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
    phase: 'build',
  });
});

test('it applies overrides on top of the defaults', () => {
  const built: unknown = buildMockFrameItem({
    title: 'Trim the log output',
    derived: { state: 'blocked' },
    phase: brandSchemas.phaseName.parse('review'),
  });

  expect(built).toStrictEqual({
    id: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    kind: 'core.issue',
    repo: expect.stringMatching(/^[a-z]+\/[a-z]+$/iu),
    title: 'Trim the log output',
    outcome: expect.any(String),
    acceptance: [{ id: 'a1', text: expect.any(String), evidence: [] }],
    foundInAttempt: null,
    filedBy: 'boxxy:owner:local',
    filedAt: expect.any(Number),
    closedAt: null,
    closeReason: null,
    derived: { state: 'blocked' },
    phase: 'review',
  });
});
