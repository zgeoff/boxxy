import { brandSchemas } from '@boxxy/model';
import type { StoreChange } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockV1ItemRow } from '@boxxy/model/test-utils/build-mock-v1-item-row';
import { buildMockClaimChange } from './build-mock-claim-change.ts';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';
import { buildMockSettleChange } from './build-mock-settle-change.ts';
import type { ClaimStoreCase } from './types.ts';

export const claimStoreSeatCases: readonly ClaimStoreCase[] = [
  [
    '#syncLimits stores the loaded limits by name, each with no seat held',
    async (store) => {
      await store.exclusive((transaction) =>
        transaction.syncLimits(
          [
            { name: brandSchemas.limitName.parse('workers'), max: 7, counts: {} },
            {
              name: brandSchemas.limitName.parse('owner-design'),
              max: 1,
              counts: { designMode: ['attended'] },
            },
          ],
          brandSchemas.instant.parse(500),
        ),
      );

      const limits: unknown = await store.read((transaction) => transaction.listLimits());

      return {
        received: limits,
        expected: [
          { name: 'owner-design', max: 1, counts: { designMode: ['attended'] }, held: 0 },
          { name: 'workers', max: 7, counts: {}, held: 0 },
        ],
      };
    },
  ],
  [
    '#syncLimits releases the seats of a limit the rules no longer name',
    async (store) => {
      const workers = brandSchemas.limitName.parse('workers');
      const reviews = brandSchemas.limitName.parse('reviews');
      const attempt = buildMockV1AttemptRow({ state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.syncLimits(
          [
            { name: workers, max: 2, counts: {} },
            { name: reviews, max: 2, counts: {} },
          ],
          brandSchemas.instant.parse(500),
        );

        await transaction.applyChange(
          buildMockFileItemChange(buildMockV1ItemRow({ id: attempt.item })),
        );

        await transaction.applyChange(buildMockClaimChange(attempt, [workers, reviews]));
      });

      await store.exclusive((transaction) =>
        transaction.syncLimits(
          [{ name: workers, max: 2, counts: {} }],
          brandSchemas.instant.parse(6000),
        ),
      );

      const state: unknown = await store.read(async (transaction) => {
        const limits = await transaction.listLimits();
        const seats = await transaction.listLimitSeats();

        return {
          limits: limits.map((limit) => [limit.name, limit.held]),
          seats: seats.map((seat) => seat.limit),
        };
      });

      return {
        received: state,
        expected: { limits: [['workers', 1]], seats: ['workers'] },
      };
    },
  ],
  [
    '#syncLimits releases a seat whose limit no longer counts the attempt fields',
    async (store) => {
      const ownerDesign = brandSchemas.limitName.parse('owner-design');

      const attempt = buildMockV1AttemptRow({
        state: 'starting',
        fields: { designMode: ['attended'] },
      });

      await store.exclusive(async (transaction) => {
        await transaction.syncLimits(
          [{ name: ownerDesign, max: 1, counts: { designMode: ['attended'] } }],
          brandSchemas.instant.parse(500),
        );

        await transaction.applyChange(
          buildMockFileItemChange(buildMockV1ItemRow({ id: attempt.item })),
        );

        await transaction.applyChange(buildMockClaimChange(attempt, [ownerDesign]));
      });

      await store.exclusive((transaction) =>
        transaction.syncLimits(
          [{ name: ownerDesign, max: 1, counts: { designMode: ['agent'] } }],
          brandSchemas.instant.parse(6000),
        ),
      );

      const seats = await store.read((transaction) => transaction.listLimitSeats());

      return { received: seats, expected: [] };
    },
  ],
  [
    '#syncLimits gives a seated attempt a seat past max in a new limit that counts it',
    async (store) => {
      const workers = brandSchemas.limitName.parse('workers');
      const builds = brandSchemas.limitName.parse('builds');
      const first = buildMockV1AttemptRow({ state: 'starting' });
      const second = buildMockV1AttemptRow({ state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.syncLimits(
          [{ name: workers, max: 2, counts: {} }],
          brandSchemas.instant.parse(500),
        );

        await transaction.applyChange(
          buildMockFileItemChange(buildMockV1ItemRow({ id: first.item })),
        );

        await transaction.applyChange(
          buildMockFileItemChange(buildMockV1ItemRow({ id: second.item })),
        );

        await transaction.applyChange(buildMockClaimChange(first, [workers]));
        await transaction.applyChange(buildMockClaimChange(second, [workers]));
      });

      await store.exclusive((transaction) =>
        transaction.syncLimits(
          [
            { name: workers, max: 2, counts: {} },
            { name: builds, max: 1, counts: {} },
          ],
          brandSchemas.instant.parse(6000),
        ),
      );

      const state: unknown = await store.read(async (transaction) => {
        const limits = await transaction.listLimits();
        const seats = await transaction.listLimitSeats();

        return {
          limits: limits.map((limit) => [limit.name, limit.held]),
          overCap: seats
            .filter((seat) => seat.limit === 'builds')
            .map((seat) => seat.overCap)
            .toSorted((left, right) => Number(left) - Number(right)),
        };
      });

      return {
        received: state,
        expected: {
          limits: [
            ['builds', 2],
            ['workers', 2],
          ],
          overCap: [false, true],
        },
      };
    },
  ],
  [
    '#syncLimits gives no seat to a sleeping attempt',
    async (store) => {
      const builds = brandSchemas.limitName.parse('builds');
      const attempt = buildMockV1AttemptRow({ state: 'sleeping' });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(
          buildMockFileItemChange(buildMockV1ItemRow({ id: attempt.item })),
        );

        await transaction.applyChange(buildMockClaimChange(attempt));

        await transaction.syncLimits(
          [{ name: builds, max: 1, counts: {} }],
          brandSchemas.instant.parse(6000),
        );
      });

      const seats = await store.read((transaction) => transaction.listLimitSeats());

      return { received: seats, expected: [] };
    },
  ],
  [
    '#applyChange takes a seat over the cap past a full limit',
    async (store) => {
      const workers = brandSchemas.limitName.parse('workers');
      const holder = buildMockV1AttemptRow({ state: 'starting' });
      const waking = buildMockV1AttemptRow({ state: 'starting' });
      const claim = buildMockClaimChange(waking);

      const overCap: StoreChange = {
        ...claim,
        writes: [
          {
            op: 'take-seats',
            take: { limits: [workers], attempt: waking.id, holdGen: 1, overCap: true },
          },
          ...claim.writes.filter((write) => write.op !== 'take-seats'),
        ],
      };

      await store.exclusive(async (transaction) => {
        await transaction.syncLimits(
          [{ name: workers, max: 1, counts: {} }],
          brandSchemas.instant.parse(500),
        );

        await transaction.applyChange(
          buildMockFileItemChange(buildMockV1ItemRow({ id: holder.item })),
        );

        await transaction.applyChange(
          buildMockFileItemChange(buildMockV1ItemRow({ id: waking.item })),
        );

        await transaction.applyChange(buildMockClaimChange(holder, [workers]));
      });

      const result = await store.exclusive((transaction) => transaction.applyChange(overCap));
      const limits = await store.read((transaction) => transaction.listLimits());

      return {
        received: { result, held: limits.map((limit) => limit.held) },
        expected: { result: { kind: 'applied' }, held: [2] },
      };
    },
  ],
  [
    '#applyChange applies a seat release of an attempt that holds no seat',
    async (store) => {
      const attempt = buildMockV1AttemptRow({ state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(
          buildMockFileItemChange(buildMockV1ItemRow({ id: attempt.item })),
        );

        await transaction.applyChange(buildMockClaimChange(attempt));
      });

      const result = await store.exclusive((transaction) =>
        transaction.applyChange(buildMockSettleChange({ attempt, state: 'failed' })),
      );

      return { received: result, expected: { kind: 'applied' } };
    },
  ],
];
