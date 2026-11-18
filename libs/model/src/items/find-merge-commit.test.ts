import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockV1AttemptRow } from '../test-utils/build-mock-v1-attempt-row.ts';
import { buildMockV1PullRequestRow } from '../test-utils/build-mock-v1-pull-request-row.ts';
import { findMergeCommit } from './find-merge-commit.ts';

function setupTest() {
  const build = buildMockV1AttemptRow({
    phase: brandSchemas.phaseName.parse('build'),
    state: 'succeeded',
  });

  return {
    build,
    buildMerged: (mergedAt: number, mergeCommit: string) =>
      buildMockV1PullRequestRow({
        attempt: build.id,
        state: 'merged',
        mergedAt: brandSchemas.instant.parse(mergedAt),
        mergeCommit: brandSchemas.commitSha.parse(mergeCommit),
      }),
  };
}

test('it finds the merge commit of the pull request merged last', () => {
  const ctx = setupTest();

  const commit = findMergeCommit(
    [ctx.build],
    [ctx.buildMerged(2000, 'b'.repeat(40)), ctx.buildMerged(1000, 'a'.repeat(40))],
  );

  expect(commit).toBe(brandSchemas.commitSha.parse('b'.repeat(40)));
});

test('it finds no merge commit while no pull request has merged', () => {
  const ctx = setupTest();

  const commit = findMergeCommit(
    [ctx.build],
    [buildMockV1PullRequestRow({ attempt: ctx.build.id, state: 'open' })],
  );

  expect(commit).toBeNull();
});

test('it ignores a pull request that no succeeded build linked', () => {
  const ctx = setupTest();
  const failed = buildMockV1AttemptRow({ phase: ctx.build.phase, state: 'failed' });

  const mergedRow = buildMockV1PullRequestRow({
    attempt: failed.id,
    state: 'merged',
    mergedAt: brandSchemas.instant.parse(1000),
    mergeCommit: brandSchemas.commitSha.parse('c'.repeat(40)),
  });

  const commit = findMergeCommit([failed], [mergedRow]);

  expect(commit).toBeNull();
});
