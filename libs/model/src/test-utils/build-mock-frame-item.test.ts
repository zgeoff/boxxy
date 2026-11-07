import { expect, test } from 'bun:test';
import { brandSchemas } from '../brand-schemas.ts';
import { buildMockFrameItem } from './build-mock-frame-item.ts';

test('it builds a ready item view in the build phase', () => {
  const built: unknown = buildMockFrameItem();

  expect(built).toStrictEqual(
    expect.objectContaining({ kind: 'core.issue', derived: { state: 'ready' }, phase: 'build' }),
  );
});

test('it applies overrides on top of the defaults', () => {
  const item = buildMockFrameItem({
    title: 'Trim the log output',
    phase: brandSchemas.phaseName.parse('review'),
  });

  expect(item).toStrictEqual(
    expect.objectContaining({ title: 'Trim the log output', phase: 'review' }),
  );
});
