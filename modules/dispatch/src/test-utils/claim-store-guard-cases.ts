import { brandSchemas } from '@boxxy/model';
import { buildMockAttemptRow } from '@boxxy/model/test-utils/build-mock-attempt-row';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';
import { buildMockItemRow } from '@boxxy/model/test-utils/build-mock-item-row';
import { buildMockBindChange } from './build-mock-bind-change.ts';
import { buildMockClaimChange } from './build-mock-claim-change.ts';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';
import { buildMockSettleChange } from './build-mock-settle-change.ts';
import { buildMockStartChange } from './build-mock-start-change.ts';
import type { ClaimStoreCase } from './types.ts';

export const claimStoreGuardCases: readonly ClaimStoreCase[] = [
  [
    '#applyChange returns stale-generation for a settle under an old slot gen',
    async (store) => {
      const first = buildMockItemRow();
      const second = buildMockItemRow();
      const settled = buildMockAttemptRow({ item: first.id, state: 'starting' });
      const holder = buildMockAttemptRow({ item: second.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: settled.pool, slots: 1 }]);
        await transaction.applyChange(buildMockFileItemChange(first));
        await transaction.applyChange(buildMockFileItemChange(second));
        await transaction.applyChange(buildMockClaimChange(settled));

        await transaction.applyChange(
          buildMockSettleChange({
            attempt: { ...settled, slot: 1, slotGen: 1 },
            state: 'succeeded',
          }),
        );

        await transaction.applyChange(buildMockClaimChange(holder));
      });

      const result = await store.exclusive((transaction) =>
        transaction.applyChange(
          buildMockSettleChange({ attempt: { ...holder, slot: 1, slotGen: 1 }, state: 'failed' }),
        ),
      );

      const slots = await store.read((transaction) => transaction.listPoolSlots());

      return {
        received: { result, slots },
        expected: {
          result: { kind: 'stale-generation' },
          slots: [{ pool: holder.pool, slot: 1, holder: holder.id, gen: 2, retired: false }],
        },
      };
    },
  ],
  [
    '#applyChange releases both leases of a settle under the live generations',
    async (store) => {
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt));
      });

      const result = await store.exclusive((transaction) =>
        transaction.applyChange(
          buildMockSettleChange({
            attempt: { ...attempt, slot: 1, slotGen: 1 },
            state: 'succeeded',
          }),
        ),
      );

      const snapshot = await store.read((transaction) =>
        transaction.readSnapshot(brandSchemas.instant.parse(5000), new Map()),
      );

      return {
        received: {
          result,
          freeSlots: snapshot.freeSlots,
          derived: snapshot.items[0]?.derived,
        },
        expected: {
          result: { kind: 'applied', slot: null },
          freeSlots: { [attempt.pool]: 1 },
          derived: { state: 'waiting', reason: 'no pull request linked' },
        },
      };
    },
  ],
  [
    '#applyChange returns stale-generation and writes no fact under a stale lease generation',
    async (store) => {
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
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
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt));

        await transaction.applyChange(
          buildMockSettleChange({ attempt: { ...attempt, slot: 1, slotGen: 1 }, state: 'failed' }),
        );
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
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
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
      const item = buildMockItemRow();

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
              payload: { reason: 'done by hand' },
            },
          ],
        }),
      );

      const state: unknown = await store.read(async (transaction) => {
        const read = await transaction.readItem(
          item.id,
          brandSchemas.instant.parse(5000),
          new Map(),
        );

        const facts = await transaction.readUnsentFacts(10);

        return { item: read, facts: facts.length };
      });

      return {
        received: { result, state },
        expected: {
          result: { kind: 'guard-mismatch', table: 'items', key: { id: item.id } },
          state: { item: { ...item, derived: { state: 'ready' } }, facts: 1 },
        },
      };
    },
  ],
  [
    '#applyChange returns guard-mismatch for an update that finds no row',
    async (store) => {
      const item = buildMockItemRow();

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
              payload: { title: 'Mend the gate' },
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

      const item = buildMockItemRow({ acceptance: [criterion] });

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
              payload: { title: 'Mend the gate' },
            },
          ],
        }),
      );

      return { received: result, expected: { kind: 'applied', slot: null } };
    },
  ],
  [
    '#findAttemptByAgentSession returns the attempt that holds an agent session id',
    async (store) => {
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });
      const agentSession = brandSchemas.agentSessionId.parse('agent-session-1');

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
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
    '#applyChange throws on a second attempt row for one agent session id',
    async (store) => {
      const first = buildMockItemRow();
      const second = buildMockItemRow();
      const holder = buildMockAttemptRow({ item: first.id, state: 'starting' });
      const other = buildMockAttemptRow({ item: second.id, state: 'starting' });
      const agentSession = brandSchemas.agentSessionId.parse('agent-session-1');

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: holder.pool, slots: 2 }]);
        await transaction.applyChange(buildMockFileItemChange(first));
        await transaction.applyChange(buildMockFileItemChange(second));
        await transaction.applyChange(buildMockClaimChange(holder));
        await transaction.applyChange(buildMockClaimChange(other));
        await transaction.applyChange(buildMockBindChange({ attempt: holder, agentSession }));
      });

      const binding = store.exclusive((transaction) =>
        transaction.applyChange(buildMockBindChange({ attempt: other, agentSession })),
      );

      const settled = await binding.then(
        () => 'bound',
        () => 'thrown',
      );

      return { received: settled, expected: 'thrown' };
    },
  ],
];
