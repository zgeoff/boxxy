import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockV1ItemRow } from '@boxxy/model/test-utils/build-mock-v1-item-row';
import { buildMockV1LeverRow } from '@boxxy/model/test-utils/build-mock-v1-lever-row';
import { buildMockClaimChange } from './build-mock-claim-change.ts';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';
import { buildMockLeverChange } from './build-mock-lever-change.ts';
import { buildMockNoteChange } from './build-mock-note-change.ts';
import { buildMockPauseChange } from './build-mock-pause-change.ts';
import type { ClaimStoreCase } from './types.ts';

export const claimStoreClaimCases: readonly ClaimStoreCase[] = [
  [
    '#applyChange returns lease-held for a second live lease on one item phase',
    async (store) => {
      const item = buildMockV1ItemRow();
      const first = buildMockV1AttemptRow({ item: item.id, state: 'starting', leaseGen: 1 });

      const second = buildMockV1AttemptRow({
        item: item.id,
        state: 'starting',
        leaseGen: 2,
        number: 2,
      });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(first));
      });

      const result = await store.exclusive((transaction) =>
        transaction.applyChange(buildMockClaimChange(second)),
      );

      return { received: result, expected: { kind: 'lease-held' } };
    },
  ],
  [
    '#applyChange writes no row and takes no seat for a change that returns lease-held',
    async (store) => {
      const workers = brandSchemas.limitName.parse('workers');
      const item = buildMockV1ItemRow();
      const first = buildMockV1AttemptRow({ item: item.id, state: 'starting', leaseGen: 1 });

      const second = buildMockV1AttemptRow({
        item: item.id,
        state: 'starting',
        leaseGen: 2,
        number: 2,
      });

      await store.exclusive(async (transaction) => {
        await transaction.syncLimits(
          [{ name: workers, max: 2, counts: {} }],
          brandSchemas.instant.parse(500),
        );

        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(first, [workers]));
        await transaction.applyChange(buildMockClaimChange(second, [workers]));
      });

      const state: unknown = await store.read(async (transaction) => {
        const snapshot = await transaction.readSnapshot(
          brandSchemas.instant.parse(5000),
          new Map(),
        );

        const seats = await transaction.listLimitSeats();

        return {
          attempt: await transaction.readAttempt(second.id),
          seats: seats.map((seat) => seat.attempt),
          lastGen: await transaction.readLastLeaseGen(item.id, first.phase),
          version: snapshot.storeVersion,
        };
      });

      return {
        received: state,
        expected: { attempt: null, seats: [first.id], lastGen: 1, version: 2 },
      };
    },
  ],
  [
    '#applyChange returns limit-full and changes no row when a limit has no free seat',
    async (store) => {
      const workers = brandSchemas.limitName.parse('workers');
      const held = buildMockV1ItemRow();
      const waiting = buildMockV1ItemRow();
      const first = buildMockV1AttemptRow({ item: held.id, state: 'starting' });
      const second = buildMockV1AttemptRow({ item: waiting.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.syncLimits(
          [{ name: workers, max: 1, counts: {} }],
          brandSchemas.instant.parse(500),
        );

        await transaction.applyChange(buildMockFileItemChange(held));
        await transaction.applyChange(buildMockFileItemChange(waiting));
        await transaction.applyChange(buildMockClaimChange(first, [workers]));
      });

      const result = await store.exclusive((transaction) =>
        transaction.applyChange(buildMockClaimChange(second, [workers])),
      );

      const state: unknown = await store.read(async (transaction) => {
        const snapshot = await transaction.readSnapshot(
          brandSchemas.instant.parse(5000),
          new Map(),
        );

        return {
          attempt: await transaction.readAttempt(second.id),
          lastGen: await transaction.readLastLeaseGen(waiting.id, second.phase),
          version: snapshot.storeVersion,
        };
      });

      return {
        received: { result, state },
        expected: {
          result: { kind: 'limit-full', limit: 'workers' },
          state: { attempt: null, lastGen: 0, version: 3 },
        },
      };
    },
  ],
  [
    '#applyChange takes the seats of a claim all or none',
    async (store) => {
      const workers = brandSchemas.limitName.parse('workers');
      const ownerDesign = brandSchemas.limitName.parse('owner-design');

      const first = buildMockV1AttemptRow({
        state: 'starting',
        phase: brandSchemas.phaseName.parse('design'),
      });

      const second = buildMockV1AttemptRow({
        state: 'starting',
        phase: brandSchemas.phaseName.parse('design'),
      });

      await store.exclusive(async (transaction) => {
        await transaction.syncLimits(
          [
            { name: workers, max: 7, counts: {} },
            { name: ownerDesign, max: 1, counts: { designMode: ['attended'] } },
          ],
          brandSchemas.instant.parse(500),
        );

        await transaction.applyChange(
          buildMockFileItemChange(buildMockV1ItemRow({ id: first.item })),
        );

        await transaction.applyChange(
          buildMockFileItemChange(buildMockV1ItemRow({ id: second.item })),
        );

        await transaction.applyChange(buildMockClaimChange(first, [ownerDesign, workers]));
      });

      const result = await store.exclusive((transaction) =>
        transaction.applyChange(buildMockClaimChange(second, [workers, ownerDesign])),
      );

      const limits = await store.read((transaction) => transaction.listLimits());

      return {
        received: { result, held: limits.map((limit) => [limit.name, limit.held]) },
        expected: {
          result: { kind: 'limit-full', limit: 'owner-design' },
          held: [
            ['owner-design', 1],
            ['workers', 1],
          ],
        },
      };
    },
  ],
  [
    '#applyChange returns unknown-limit for a take that names a limit the store does not hold',
    async (store) => {
      const attempt = buildMockV1AttemptRow({ state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(
          buildMockFileItemChange(buildMockV1ItemRow({ id: attempt.item })),
        );
      });

      const result = await store.exclusive((transaction) =>
        transaction.applyChange(
          buildMockClaimChange(attempt, [brandSchemas.limitName.parse('reviews')]),
        ),
      );

      return { received: result, expected: { kind: 'unknown-limit', limit: 'reviews' } };
    },
  ],
  [
    '#applyChange gives each lever insert its seq, in the row and the fact',
    async (store) => {
      const item = buildMockV1ItemRow();
      const defer = buildMockV1LeverRow({ seq: 0, item: item.id, kind: 'plan.defer' });
      const expedite = buildMockV1LeverRow({ seq: 0, item: item.id, kind: 'plan.expedite' });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockLeverChange(defer));
        await transaction.applyChange(buildMockLeverChange(expedite));
      });

      const state: unknown = await store.read(async (transaction) => {
        const items = await transaction.listItems({}, brandSchemas.instant.parse(5000), new Map());
        const facts = await transaction.readUnsentFacts(10);

        return { levers: items[0]?.levers, payloads: facts.slice(1).map((fact) => fact.payload) };
      });

      return {
        received: state,
        expected: {
          levers: [
            { ...defer, seq: 1 },
            { ...expedite, seq: 2 },
          ],
          payloads: [
            { ...defer, seq: 1 },
            { ...expedite, seq: 2 },
          ],
        },
      };
    },
  ],
  [
    '#applyChange throws and writes nothing for a fact whose payload its type refuses',
    async (store) => {
      const item = buildMockV1ItemRow();

      await store.exclusive((transaction) =>
        transaction.applyChange(buildMockFileItemChange(item)),
      );

      const outcome = await Promise.allSettled([
        store.exclusive((transaction) =>
          transaction.applyChange(
            buildMockNoteChange({
              item: item.id,
              seq: 1,
              text: '',
              by: 'boxxy:owner:local',
              at: brandSchemas.instant.parse(4500),
            }),
          ),
        ),
      ]);

      const state: unknown = await store.read(async (transaction) => {
        const facts = await transaction.readUnsentFacts(10);

        return { notes: await transaction.listItemNotes(item.id), facts: facts.length };
      });

      return {
        received: { status: outcome[0]?.status, state },
        expected: { status: 'rejected', state: { notes: [], facts: 1 } },
      };
    },
  ],
  [
    '#applyChange applies a change with no fact and moves no store version',
    async (store) => {
      const runner = brandSchemas.runnerId.parse('runner-1');
      const item = buildMockV1ItemRow();

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.writeHeartbeat(runner, brandSchemas.instant.parse(1000));
      });

      const result = await store.exclusive((transaction) =>
        transaction.applyChange(buildMockPauseChange(runner)),
      );

      const state: unknown = await store.read(async (transaction) => {
        const snapshot = await transaction.readSnapshot(
          brandSchemas.instant.parse(5000),
          new Map(),
        );

        return { runner: await transaction.readRunner(runner), version: snapshot.storeVersion };
      });

      return {
        received: { result, state },
        expected: {
          result: { kind: 'applied' },
          state: { runner: { id: 'runner-1', heartbeatAt: 1000, paused: true }, version: 1 },
        },
      };
    },
  ],
];
