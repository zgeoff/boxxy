import type { ItemId } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockLeverChange } from './build-mock-lever-change.ts';
import type { FakeForge } from './create-fake-forge.ts';
import type { TestDispatch } from './create-test-dispatch.ts';

const repo = brandSchemas.repoName.parse('example/app');

// the merge commit of the pull request that `seedMergedItem` merges
export const seededMergeCommit = brandSchemas.commitSha.parse('c0'.repeat(20));

export interface SeedMergedItemOptions {
  // the pull request number the build links; 7 when left out
  readonly number?: number;

  // false: the pull request stays open, so the item has no merge commit
  readonly isMerged?: boolean;
}

// An item that built, merged its pull request, and stands at the `verify` step of the ship rules,
// which waits on `shipped`. Its one criterion carries the given tags.
export async function seedMergedItem(
  dispatch: TestDispatch,
  forge: FakeForge,
  tags: readonly string[],
  options: SeedMergedItemOptions = {},
): Promise<ItemId> {
  const number = options.number ?? 7;

  const build = await dispatch.seedBuildWithPullRequest(forge, number);

  const now = dispatch.clock.now();

  await dispatch.store.exclusive((tx) =>
    tx.applyChange({
      at: now,
      writes: [
        ...(options.isMerged === false
          ? []
          : [
              {
                op: 'update',
                table: 'pull_requests',
                key: { repo, number },
                expect: { state: 'open' },
                set: { state: 'merged', mergedAt: now, mergeCommit: seededMergeCommit },
              } as const,
            ]),
        {
          op: 'update',
          table: 'items',
          key: { id: build.item },
          expect: {},
          set: {
            acceptance: [
              {
                id: brandSchemas.criterionId.parse('a1'),
                text: 'The page renders on prod.',
                evidence: [],
                ...(tags.length === 0 ? {} : { tags }),
              },
            ],
          },
        },
      ],
      facts: [],
    }),
  );

  dispatch.clock.advance(1000);

  await dispatch.store.exclusive((tx) =>
    tx.applyChange(
      buildMockLeverChange({
        seq: 1,
        kind: 'item.retry',
        item: build.item,
        until: null,
        expiresAt: null,
        reason: null,
        phase: brandSchemas.phaseName.parse('verify'),
        actor: 'boxxy:owner:local',
        at: dispatch.clock.now(),
      }),
    ),
  );

  dispatch.clock.advance(1000);

  return build.item;
}
