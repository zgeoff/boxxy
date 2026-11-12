import { brandSchemas } from '@boxxy/model';
import type { AttemptRow, StoreChange } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockV1ItemRow } from '@boxxy/model/test-utils/build-mock-v1-item-row';
import invariant from 'tiny-invariant';
import { buildAttemptChange } from '../attempts/build-attempt-change.ts';
import type { MoveEvent } from '../attempts/types.ts';
import { buildMockClaimChange } from './build-mock-claim-change.ts';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';
import { buildMockNewId } from './build-mock-new-id.ts';
import type { ClaimStoreCase } from './types.ts';

export const claimStoreRaceCases: readonly ClaimStoreCase[] = [
  [
    '#applyChange applies the attempt builder claim with its lease, seats, decision and fact',
    async (store) => {
      const item = buildMockV1ItemRow();
      const workers = brandSchemas.limitName.parse('workers');
      const pool = brandSchemas.poolName.parse('main');
      const rulesVersion = brandSchemas.rulesVersion.parse('a'.repeat(64));

      const built = buildAttemptChange({
        actor: 'boxxy:runner:runner-1',
        now: brandSchemas.instant.parse(5000),
        newId: buildMockNewId(),
        attempt: null,
        event: {
          kind: 'claimed',
          attempt: buildMockV1AttemptRow().id,
          pick: {
            kind: 'start',
            item: item.id,
            phase: brandSchemas.phaseName.parse('build'),
            round: 1,
            pool,
            fields: { repo: ['acme/lamps'] },
            limits: [workers],
          },
          number: 1,
          runner: brandSchemas.runnerId.parse('runner-1'),
          leaseGen: 1,
          recipe: { hash: brandSchemas.recipeHash.parse('c'.repeat(64)), rulesVersion },
          skillsRef: null,
          spawnRequest: { prompt: 'Fix the flicker.' },
          spawnRequestHash: buildMockV1AttemptRow().spawnRequestHash,
          input: { findings: [] },
          mode: 'agent',
          worker: brandSchemas.workerKindName.parse('atc.session'),
          caller: null,
          decision: {
            item: item.id,
            kind: 'start',
            pool,
            rulesVersion,
            snapshotHash: brandSchemas.snapshotHash.parse('b'.repeat(64)),
            storeVersion: 1,
            pepysOffsets: {},
            faults: [],
            limits: [{ limit: workers, held: 0, max: 2 }],
          },
        },
      });

      invariant(built.kind === 'change', 'the attempt machine allows a claim');

      await store.exclusive(async (transaction) => {
        await transaction.syncLimits(
          [{ name: workers, max: 2, counts: {} }],
          brandSchemas.instant.parse(500),
        );

        await transaction.applyChange(buildMockFileItemChange(item));
      });

      const result = await store.exclusive((transaction) => transaction.applyChange(built.change));

      const state: unknown = await store.read(async (transaction) => {
        const attempts = await transaction.listItemAttempts(item.id);
        const limits = await transaction.listLimits();
        const facts = await transaction.readUnsentFacts(10);

        return {
          attempts: attempts.map((attempt) => [attempt.state, attempt.input]),
          held: limits.map((limit) => limit.held),
          facts: facts.map((fact) => fact.type),
        };
      });

      return {
        received: { result, state },
        expected: {
          result: { kind: 'applied' },
          state: {
            attempts: [['starting', { findings: [] }]],
            held: [1],
            facts: ['boxxy.item.filed', 'boxxy.attempt.claimed', 'boxxy.decision.recorded'],
          },
        },
      };
    },
  ],
  [
    '#applyChange refuses the second of two attempt moves built from one read',
    async (store) => {
      const attempt = buildMockV1AttemptRow({ state: 'running' });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(
          buildMockFileItemChange(buildMockV1ItemRow({ id: attempt.item })),
        );

        await transaction.applyChange(buildMockClaimChange(attempt));
      });

      const read = await store.read((transaction) => transaction.readAttempt(attempt.id));

      invariant(read !== null, 'the claim stored the attempt');

      const first = buildMoveChange(read, { kind: 'suspend-asked' });
      const second = buildMoveChange(read, { kind: 'stalled' });

      const results = await store.exclusive(async (transaction) => [
        await transaction.applyChange(first),
        await transaction.applyChange(second),
      ]);

      return {
        received: results,
        expected: [
          { kind: 'applied' },
          { kind: 'guard-mismatch', table: 'attempts', key: { id: attempt.id } },
        ],
      };
    },
  ],
];

// the attempt builder's change, which the store takes as it is
function buildMoveChange(attempt: AttemptRow, event: MoveEvent): StoreChange {
  const built = buildAttemptChange({
    actor: 'boxxy:runner:runner-1',
    now: brandSchemas.instant.parse(5000),
    newId: buildMockNewId(),
    attempt,
    event,
  });

  invariant(built.kind === 'change', 'the attempt machine allows the move');

  return built.change;
}
