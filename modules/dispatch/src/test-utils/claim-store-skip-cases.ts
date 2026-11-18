import { brandSchemas } from '@boxxy/model';
import type { StoreChange } from '@boxxy/model';
import { buildMockV1ItemRow } from '@boxxy/model/test-utils/build-mock-v1-item-row';
import { buildSkipChange } from '../attempts/build-skip-change.ts';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';
import type { ClaimStoreCase } from './types.ts';

export const claimStoreSkipCases: readonly ClaimStoreCase[] = [
  [
    '#listItemAttempts reads a skipped attempt with no pool, spawn request or session',
    async (store) => {
      const item = buildMockV1ItemRow();

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));

        await transaction.applyChange(
          buildSkip(item, '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e01', 'verify'),
        );
      });

      const attempts = await store.read((transaction) => transaction.listItemAttempts(item.id));

      return {
        received: attempts.map((attempt) => [
          attempt.state,
          attempt.outcome,
          attempt.worker,
          attempt.pool,
          attempt.spawnRequest,
          attempt.spawnRequestHash,
          attempt.skipReason,
        ]),
        expected: [['succeeded', 'skipped', 'skip', null, null, null, 'no-criteria-tagged:prod']],
      };
    },
  ],
  [
    '#listItemAttempts keeps attempts written in one millisecond in the order they were written',
    async (store) => {
      const item = buildMockV1ItemRow();
      const ids = ['09', '03', '07'].map((tail) => `0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e${tail}`);
      const phases = ['review', 'verify', 'merge'];

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));

        for (const [index, id] of ids.entries()) {
          await transaction.applyChange(buildSkip(item, id, phases[index] ?? 'review'));
        }
      });

      const attempts = await store.read((transaction) => transaction.listItemAttempts(item.id));

      return { received: attempts.map((attempt) => attempt.phase), expected: phases };
    },
  ],
  [
    'the session reads and the pull request link pass over a skipped attempt',
    async (store) => {
      const item = buildMockV1ItemRow();

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));

        await transaction.applyChange(
          buildSkip(item, '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e01', 'build'),
        );
      });

      const reads = await store.read(async (transaction) => ({
        live: await transaction.listLiveAttempts(),
        strays: await transaction.listStrayAttempts(brandSchemas.instant.parse(0)),
        forgettable: await transaction.listSessionsToForget(
          brandSchemas.instant.parse(9_000_000_000),
        ),
        unlinked: await transaction.listSucceededAttemptsWithoutPullRequest(),
      }));

      return { received: reads, expected: { live: [], strays: [], forgettable: [], unlinked: [] } };
    },
  ],
];

const at = brandSchemas.instant.parse(5000);

function buildSkip(
  item: ReturnType<typeof buildMockV1ItemRow>,
  id: string,
  phase: string,
): StoreChange {
  return buildSkipChange({
    attempt: brandSchemas.attemptId.parse(id),
    fact: brandSchemas.factId.parse(`0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b${id.slice(-2)}`),
    actor: 'boxxy:runner:runner-1',
    runner: brandSchemas.runnerId.parse('runner-1'),
    now: at,
    item: item.id,
    phase: brandSchemas.phaseName.parse(phase),
    round: 1,
    number: 1,
    reason: 'no-criteria-tagged:prod',
    recipeHash: brandSchemas.recipeHash.parse('a'.repeat(64)),
    rulesVersion: brandSchemas.rulesVersion.parse('b'.repeat(64)),
  });
}
