import { expect } from 'bun:test';
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

      await store.exclusive(async (tx) => {
        await tx.syncPoolSlots([{ name: settled.pool, slots: 1 }]);
        await tx.applyChange(buildMockFileItemChange(first));
        await tx.applyChange(buildMockFileItemChange(second));
        await tx.applyChange(buildMockClaimChange(settled));

        await tx.applyChange(
          buildMockSettleChange({
            attempt: { ...settled, slot: 1, slotGen: 1 },
            state: 'succeeded',
          }),
        );

        await tx.applyChange(buildMockClaimChange(holder));
      });

      const result = await store.exclusive((tx) =>
        tx.applyChange(
          buildMockSettleChange({ attempt: { ...holder, slot: 1, slotGen: 1 }, state: 'failed' }),
        ),
      );

      const slots = await store.read((tx) => tx.listPoolSlots());

      expect({ result, slots }).toStrictEqual({
        result: { kind: 'stale-generation' },
        slots: [{ pool: holder.pool, slot: 1, holder: holder.id, gen: 2, retired: false }],
      });
    },
  ],
  [
    '#applyChange releases both leases of a settle under the live generations',
    async (store) => {
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (tx) => {
        await tx.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
        await tx.applyChange(buildMockFileItemChange(item));
        await tx.applyChange(buildMockClaimChange(attempt));
      });

      const result = await store.exclusive((tx) =>
        tx.applyChange(
          buildMockSettleChange({
            attempt: { ...attempt, slot: 1, slotGen: 1 },
            state: 'succeeded',
          }),
        ),
      );

      const snapshot = await store.read((tx) =>
        tx.readSnapshot(brandSchemas.instant.parse(5000), new Map()),
      );

      expect({
        result,
        freeSlots: snapshot.freeSlots,
        derived: snapshot.items[0]?.derived,
      }).toStrictEqual({
        result: { kind: 'applied', slot: null },
        freeSlots: { [attempt.pool]: 1 },
        derived: { state: 'waiting', reason: 'no PR linked' },
      });
    },
  ],
  [
    '#applyChange refuses a change under a stale lease generation whole',
    async (store) => {
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (tx) => {
        await tx.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
        await tx.applyChange(buildMockFileItemChange(item));
        await tx.applyChange(buildMockClaimChange(attempt));
      });

      const result = await store.exclusive((tx) =>
        tx.applyChange(buildMockStartChange({ ...attempt, leaseGen: 2 })),
      );

      const state: unknown = await store.read(async (tx) => {
        const read = await tx.readAttempt(attempt.id);
        const facts = await tx.readUnsentFacts(10);

        return { attempt: read?.state, facts: facts.length };
      });

      expect({ result, state }).toStrictEqual({
        result: { kind: 'stale-generation' },
        state: { attempt: 'starting', facts: 2 },
      });
    },
  ],
  [
    '#applyChange returns stale-generation under a released lease',
    async (store) => {
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (tx) => {
        await tx.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
        await tx.applyChange(buildMockFileItemChange(item));
        await tx.applyChange(buildMockClaimChange(attempt));

        await tx.applyChange(
          buildMockSettleChange({ attempt: { ...attempt, slot: 1, slotGen: 1 }, state: 'failed' }),
        );
      });

      const result = await store.exclusive((tx) => tx.applyChange(buildMockStartChange(attempt)));

      expect(result).toStrictEqual({ kind: 'stale-generation' });
    },
  ],
  [
    '#applyChange applies a change under the live lease generation',
    async (store) => {
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (tx) => {
        await tx.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
        await tx.applyChange(buildMockFileItemChange(item));
        await tx.applyChange(buildMockClaimChange(attempt));
        await tx.applyChange(buildMockStartChange(attempt));
      });

      const read = await store.read((tx) => tx.readAttempt(attempt.id));

      expect(read?.state).toBe('running');
    },
  ],
  [
    '#applyChange returns guard-mismatch and writes nothing when an expect fails',
    async (store) => {
      const item = buildMockItemRow();

      await store.exclusive((tx) => tx.applyChange(buildMockFileItemChange(item)));

      const result = await store.exclusive((tx) =>
        tx.applyChange({
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

      const state: unknown = await store.read(async (tx) => {
        const read = await tx.readItem(item.id, brandSchemas.instant.parse(5000), new Map());
        const facts = await tx.readUnsentFacts(10);

        return { item: read, facts: facts.length };
      });

      expect({ result, state }).toStrictEqual({
        result: { kind: 'guard-mismatch', table: 'items', key: { id: item.id } },
        state: { item: { ...item, derived: { state: 'ready' } }, facts: 1 },
      });
    },
  ],
  [
    '#applyChange returns guard-mismatch for an update that finds no row',
    async (store) => {
      const item = buildMockItemRow();

      const result = await store.exclusive((tx) =>
        tx.applyChange({
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

      expect(result).toStrictEqual({
        kind: 'guard-mismatch',
        table: 'items',
        key: { id: item.id },
      });
    },
  ],
  [
    '#findAttemptByAgentSession returns the attempt that holds an agent session id',
    async (store) => {
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });
      const agentSession = brandSchemas.agentSessionId.parse('agent-session-1');

      await store.exclusive(async (tx) => {
        await tx.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
        await tx.applyChange(buildMockFileItemChange(item));
        await tx.applyChange(buildMockClaimChange(attempt));
        await tx.applyChange(buildMockBindChange({ attempt, agentSession }));
      });

      const found = await store.read((tx) => tx.findAttemptByAgentSession(agentSession));

      expect(found).toBe(attempt.id);
    },
  ],
  [
    '#findAttemptByAgentSession returns null for an unknown agent session id',
    async (store) => {
      const found = await store.read((tx) =>
        tx.findAttemptByAgentSession(brandSchemas.agentSessionId.parse('agent-session-9')),
      );

      expect(found).toBeNull();
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

      await store.exclusive(async (tx) => {
        await tx.syncPoolSlots([{ name: holder.pool, slots: 2 }]);
        await tx.applyChange(buildMockFileItemChange(first));
        await tx.applyChange(buildMockFileItemChange(second));
        await tx.applyChange(buildMockClaimChange(holder));
        await tx.applyChange(buildMockClaimChange(other));
        await tx.applyChange(buildMockBindChange({ attempt: holder, agentSession }));
      });

      const binding = store.exclusive((tx) =>
        tx.applyChange(buildMockBindChange({ attempt: other, agentSession })),
      );

      await binding.catch(() => null);

      expect(binding).rejects.toThrow();
    },
  ],
];
