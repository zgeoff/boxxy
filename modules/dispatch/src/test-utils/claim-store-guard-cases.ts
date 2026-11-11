import { brandSchemas } from '@boxxy/model';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';
import { buildMockItemRules } from '@boxxy/model/test-utils/build-mock-item-rules';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockV1ItemRow } from '@boxxy/model/test-utils/build-mock-v1-item-row';
import { buildMockBindChange } from './build-mock-bind-change.ts';
import { buildMockClaimChange } from './build-mock-claim-change.ts';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';
import { buildMockSettleChange } from './build-mock-settle-change.ts';
import { buildMockStartChange } from './build-mock-start-change.ts';
import type { ClaimStoreCase } from './types.ts';

export const claimStoreGuardCases: readonly ClaimStoreCase[] = [
  [
    '#applyChange returns stale-generation and keeps the seats for a settle under an old hold gen',
    async (store) => {
      const workers = brandSchemas.limitName.parse('workers');
      const item = buildMockV1ItemRow();
      const attempt = buildMockV1AttemptRow({ item: item.id, state: 'starting', holdGen: 2 });

      await store.exclusive(async (transaction) => {
        await transaction.syncLimits(
          [{ name: workers, max: 1, counts: {} }],
          brandSchemas.instant.parse(500),
        );

        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt, [workers]));
      });

      const result = await store.exclusive((transaction) =>
        transaction.applyChange(
          buildMockSettleChange({ attempt: { ...attempt, holdGen: 1 }, state: 'failed' }),
        ),
      );

      const seats = await store.read((transaction) => transaction.listLimitSeats());

      return {
        received: { result, seats },
        expected: {
          result: { kind: 'stale-generation' },
          seats: [
            {
              limit: 'workers',
              attempt: attempt.id,
              holdGen: 2,
              overCap: false,
              takenAt: attempt.claimedAt,
              releasedAt: null,
            },
          ],
        },
      };
    },
  ],
  [
    '#applyChange releases the lease and the seats of a settle under the live generations',
    async (store) => {
      const workers = brandSchemas.limitName.parse('workers');
      const item = buildMockV1ItemRow();
      const attempt = buildMockV1AttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.syncLimits(
          [{ name: workers, max: 1, counts: {} }],
          brandSchemas.instant.parse(500),
        );

        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt, [workers]));
      });

      const result = await store.exclusive((transaction) =>
        transaction.applyChange(buildMockSettleChange({ attempt, state: 'succeeded' })),
      );

      const snapshot = await store.read((transaction) =>
        transaction.readSnapshot(brandSchemas.instant.parse(5000), buildMockItemRules()),
      );

      return {
        received: {
          result,
          limits: snapshot.limits,
          derived: snapshot.items[0]?.derived,
        },
        expected: {
          result: { kind: 'applied' },
          limits: [{ name: 'workers', max: 1, counts: {}, held: 0 }],
          derived: { state: 'waiting', reason: 'no pull request linked' },
        },
      };
    },
  ],
  [
    '#applyChange returns stale-generation and writes no fact under a stale lease generation',
    async (store) => {
      const item = buildMockV1ItemRow();
      const attempt = buildMockV1AttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt));
      });

      const result = await store.exclusive((transaction) =>
        transaction.applyChange(buildMockStartChange({ ...attempt, leaseGen: 2 })),
      );

      const state: unknown = await store.read(async (transaction) => {
        const read = await transaction.readAttempt(attempt.id);
        const facts = await transaction.readUnsentFacts(10);

        return { attempt: read?.state, facts: facts.length };
      });

      return {
        received: { result, state },
        expected: {
          result: { kind: 'stale-generation' },
          state: { attempt: 'starting', facts: 2 },
        },
      };
    },
  ],
  [
    '#applyChange returns stale-generation under a released lease',
    async (store) => {
      const item = buildMockV1ItemRow();
      const attempt = buildMockV1AttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt));
        await transaction.applyChange(buildMockSettleChange({ attempt, state: 'failed' }));
      });

      const result = await store.exclusive((transaction) =>
        transaction.applyChange(buildMockStartChange(attempt)),
      );

      return { received: result, expected: { kind: 'stale-generation' } };
    },
  ],
  [
    '#applyChange applies a change under the live lease generation',
    async (store) => {
      const item = buildMockV1ItemRow();
      const attempt = buildMockV1AttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt));
        await transaction.applyChange(buildMockStartChange(attempt));
      });

      const read = await store.read((transaction) => transaction.readAttempt(attempt.id));

      return { received: read?.state, expected: 'running' };
    },
  ],
  [
    '#applyChange returns guard-mismatch and writes nothing when an expect fails',
    async (store) => {
      const item = buildMockV1ItemRow();

      await store.exclusive((transaction) =>
        transaction.applyChange(buildMockFileItemChange(item)),
      );

      const result = await store.exclusive((transaction) =>
        transaction.applyChange({
          at: brandSchemas.instant.parse(3000),
          writes: [
            {
              op: 'update',
              table: 'items',
              key: { id: item.id },
              expect: { closedAt: null },
              set: { title: 'Mend the gate' },
            },
            {
              op: 'update',
              table: 'items',
              key: { id: item.id },
              expect: { title: 'Paint the fence' },
              set: { closedAt: brandSchemas.instant.parse(3000), closeReason: 'done by hand' },
            },
          ],
          facts: [
            {
              id: buildMockFactId(),
              type: 'boxxy.item.closed',
              entity: `boxxy:item:${item.id}`,
              actor: 'boxxy:owner:local',
              payload: { reason: 'done by hand', byAttempt: null, ended: [] },
            },
          ],
        }),
      );

      const state: unknown = await store.read(async (transaction) => {
        const read = await transaction.readItem(
          item.id,
          brandSchemas.instant.parse(5000),
          buildMockItemRules(),
        );

        const facts = await transaction.readUnsentFacts(10);

        return { item: read, facts: facts.length };
      });

      return {
        received: { result, state },
        expected: {
          result: { kind: 'guard-mismatch', table: 'items', key: { id: item.id } },
          state: {
            item: {
              ...item,
              derived: { state: 'ready' },
              position: { kind: 'phase', phase: 'build', round: 1 },
            },
            facts: 1,
          },
        },
      };
    },
  ],
  [
    '#applyChange returns guard-mismatch for an update that finds no row',
    async (store) => {
      const item = buildMockV1ItemRow();

      const result = await store.exclusive((transaction) =>
        transaction.applyChange({
          at: brandSchemas.instant.parse(3000),
          writes: [
            {
              op: 'update',
              table: 'items',
              key: { id: item.id },
              expect: {},
              set: { title: 'Mend the gate' },
            },
          ],
          facts: [
            {
              id: buildMockFactId(),
              type: 'boxxy.item.edited',
              entity: `boxxy:item:${item.id}`,
              actor: 'boxxy:owner:local',
              payload: { title: 'Mend the gate', byAttempt: null },
            },
          ],
        }),
      );

      return {
        received: result,
        expected: {
          kind: 'guard-mismatch',
          table: 'items',
          key: { id: item.id },
        },
      };
    },
  ],
  [
    '#applyChange matches a JSON column guard whose keys come in another order',
    async (store) => {
      const criterion = {
        id: brandSchemas.criterionId.parse('a1'),
        text: 'The gate swings shut',
        evidence: [],
      };

      const item = buildMockV1ItemRow({ acceptance: [criterion] });

      await store.exclusive((transaction) =>
        transaction.applyChange(buildMockFileItemChange(item)),
      );

      const result = await store.exclusive((transaction) =>
        transaction.applyChange({
          at: brandSchemas.instant.parse(3000),
          writes: [
            {
              op: 'update',
              table: 'items',
              key: { id: item.id },
              expect: {
                acceptance: [
                  { evidence: criterion.evidence, text: criterion.text, id: criterion.id },
                ],
              },
              set: { title: 'Mend the gate' },
            },
          ],
          facts: [
            {
              id: buildMockFactId(),
              type: 'boxxy.item.edited',
              entity: `boxxy:item:${item.id}`,
              actor: 'boxxy:owner:local',
              payload: { title: 'Mend the gate', byAttempt: null },
            },
          ],
        }),
      );

      return { received: result, expected: { kind: 'applied' } };
    },
  ],
  [
    '#findAttemptByAgentSession returns the attempt that holds an agent session id',
    async (store) => {
      const item = buildMockV1ItemRow();
      const attempt = buildMockV1AttemptRow({ item: item.id, state: 'starting' });
      const agentSession = brandSchemas.agentSessionId.parse('agent-session-1');

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt));
        await transaction.applyChange(buildMockBindChange({ attempt, agentSession }));
      });

      const found = await store.read((transaction) =>
        transaction.findAttemptByAgentSession(agentSession),
      );

      return { received: found, expected: attempt.id };
    },
  ],
  [
    '#findAttemptByAgentSession returns null for an unknown agent session id',
    async (store) => {
      const found = await store.read((transaction) =>
        transaction.findAttemptByAgentSession(brandSchemas.agentSessionId.parse('agent-session-9')),
      );

      return { received: found, expected: null };
    },
  ],
  [
    '#findAttemptByAgentSession returns the later of two attempts bound to one agent session',
    async (store) => {
      const item = buildMockV1ItemRow();
      const agentSession = brandSchemas.agentSessionId.parse('agent-session-1');

      const earlier = buildMockV1AttemptRow({
        item: item.id,
        state: 'starting',
        claimedAt: brandSchemas.instant.parse(1000),
      });

      const later = buildMockV1AttemptRow({
        item: item.id,
        state: 'starting',
        number: 2,
        leaseGen: 2,
        atcSession: earlier.atcSession,
        claimedAt: brandSchemas.instant.parse(4000),
      });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(earlier));
        await transaction.applyChange(buildMockBindChange({ attempt: earlier, agentSession }));
        await transaction.applyChange(buildMockSettleChange({ attempt: earlier, state: 'failed' }));
        await transaction.applyChange(buildMockClaimChange(later));
        await transaction.applyChange(buildMockBindChange({ attempt: later, agentSession }));
      });

      const found = await store.read((transaction) =>
        transaction.findAttemptByAgentSession(agentSession),
      );

      return { received: found, expected: later.id };
    },
  ],
];
