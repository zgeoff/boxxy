import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockV1ItemRow } from '@boxxy/model/test-utils/build-mock-v1-item-row';
import { buildMockClaimChange } from './build-mock-claim-change.ts';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';
import { buildMockSettleChange } from './build-mock-settle-change.ts';
import { buildMockStartChange } from './build-mock-start-change.ts';
import type { ClaimStoreCase } from './types.ts';

export const claimStoreSessionCases: readonly ClaimStoreCase[] = [
  [
    '#findSessionByCaller returns the session whose latest attempt holds the caller',
    async (store) => {
      const caller = { issuer: 'https://id.example.test', subject: 'worker-1' };
      const attempt = buildMockV1AttemptRow({ state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(
          buildMockFileItemChange(buildMockV1ItemRow({ id: attempt.item })),
        );

        await transaction.applyChange(buildMockClaimChange(attempt));
        await transaction.applyChange(buildMockStartChange(attempt, caller));
      });

      const found = await store.read((transaction) => transaction.findSessionByCaller(caller));

      return { received: found, expected: attempt.atcSession };
    },
  ],
  [
    '#findSessionByCaller returns null when only an older attempt of the session holds the caller',
    async (store) => {
      const caller = { issuer: 'https://id.example.test', subject: 'worker-1' };
      const item = buildMockV1ItemRow();

      const earlier = buildMockV1AttemptRow({
        item: item.id,
        state: 'starting',
        caller,
        claimedAt: brandSchemas.instant.parse(1000),
      });

      const later = buildMockV1AttemptRow({
        item: item.id,
        state: 'starting',
        number: 2,
        leaseGen: 2,
        atcSession: earlier.atcSession,
        caller: { issuer: 'https://id.example.test', subject: 'worker-2' },
        claimedAt: brandSchemas.instant.parse(4000),
      });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(earlier));
        await transaction.applyChange(buildMockSettleChange({ attempt: earlier, state: 'failed' }));
        await transaction.applyChange(buildMockClaimChange(later));
      });

      const found = await store.read((transaction) => transaction.findSessionByCaller(caller));

      return { received: found, expected: null };
    },
  ],
  [
    '#findSessionByCaller returns the kept session while a claim that resumes it has no session yet',
    async (store) => {
      const caller = { issuer: 'https://id.example.test', subject: 'worker-1' };
      const item = buildMockV1ItemRow();

      const kept = buildMockV1AttemptRow({
        item: item.id,
        state: 'starting',
        caller,
        claimedAt: brandSchemas.instant.parse(1000),
      });

      const resumed = buildMockV1AttemptRow({
        item: item.id,
        state: 'starting',
        number: 2,
        leaseGen: 2,
        atcSession: null,
        caller,
        claimedAt: brandSchemas.instant.parse(4000),
      });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(kept));
        await transaction.applyChange(buildMockSettleChange({ attempt: kept, state: 'succeeded' }));
        await transaction.applyChange(buildMockClaimChange(resumed));
      });

      const found = await store.read((transaction) => transaction.findSessionByCaller(caller));

      return { received: found, expected: kept.atcSession };
    },
  ],
  [
    '#findSessionByCaller returns ambiguous when the latest attempts of two sessions hold it',
    async (store) => {
      const caller = { issuer: 'https://id.example.test', subject: 'worker-1' };
      const first = buildMockV1AttemptRow({ state: 'starting', caller });
      const second = buildMockV1AttemptRow({ state: 'starting', caller });

      await store.exclusive(async (transaction) => {
        for (const attempt of [first, second]) {
          await transaction.applyChange(
            buildMockFileItemChange(buildMockV1ItemRow({ id: attempt.item })),
          );

          await transaction.applyChange(buildMockClaimChange(attempt));
        }
      });

      const found = await store.read((transaction) => transaction.findSessionByCaller(caller));

      return { received: found, expected: 'ambiguous' };
    },
  ],
  [
    '#findSessionByCaller returns null for a caller no attempt holds',
    async (store) => {
      const found = await store.read((transaction) =>
        transaction.findSessionByCaller({ issuer: 'https://id.example.test', subject: 'nobody' }),
      );

      return { received: found, expected: null };
    },
  ],
  [
    '#listKeptSessions returns the kept session of each item, oldest kept first',
    async (store) => {
      const later = {
        atcSession: brandSchemas.atcSessionId.parse('atc-session-2'),
        target: 'worker-host-a',
        attempt: buildMockV1AttemptRow().id,
        keptAt: brandSchemas.instant.parse(4000),
        caller: null,
      };

      const earlier = {
        atcSession: brandSchemas.atcSessionId.parse('atc-session-1'),
        target: 'worker-host-b',
        attempt: buildMockV1AttemptRow().id,
        keptAt: brandSchemas.instant.parse(3000),
        caller: { issuer: 'https://id.example.test', subject: 'worker-1' },
      };

      const laterItem = buildMockV1ItemRow({ keptSession: later });
      const earlierItem = buildMockV1ItemRow({ keptSession: earlier });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(laterItem));
        await transaction.applyChange(buildMockFileItemChange(earlierItem));
        await transaction.applyChange(buildMockFileItemChange(buildMockV1ItemRow()));
      });

      const kept: unknown = await store.read((transaction) => transaction.listKeptSessions());

      return {
        received: kept,
        expected: [
          { item: earlierItem.id, kept: earlier },
          { item: laterItem.id, kept: later },
        ],
      };
    },
  ],
  [
    '#listSessionsToForget returns a failed review at once and leaves a failed build until the cutoff',
    async (store) => {
      const review = buildMockV1AttemptRow({
        phase: brandSchemas.phaseName.parse('review'),
        state: 'failed',
        endedAt: brandSchemas.instant.parse(5000),
        claimedAt: brandSchemas.instant.parse(1000),
      });

      const build = buildMockV1AttemptRow({
        state: 'failed',
        endedAt: brandSchemas.instant.parse(5000),
        claimedAt: brandSchemas.instant.parse(1100),
      });

      await store.exclusive(async (transaction) => {
        for (const attempt of [review, build]) {
          await transaction.applyChange(
            buildMockFileItemChange(buildMockV1ItemRow({ id: attempt.item })),
          );

          await transaction.applyChange(buildMockClaimChange(attempt));
        }
      });

      const listed = await store.read((transaction) =>
        transaction.listSessionsToForget(
          brandSchemas.instant.parse(3000),
          brandSchemas.instant.parse(1500),
        ),
      );

      return { received: listed.map((attempt) => attempt.id), expected: [review.id] };
    },
  ],
  [
    '#listSessionsToForget returns a succeeded session at once and a failed one past the cutoff',
    async (store) => {
      const succeeded = buildMockV1AttemptRow({
        state: 'succeeded',
        endedAt: brandSchemas.instant.parse(5000),
        claimedAt: brandSchemas.instant.parse(1000),
      });

      const failedOld = buildMockV1AttemptRow({
        state: 'failed',
        endedAt: brandSchemas.instant.parse(2000),
        claimedAt: brandSchemas.instant.parse(1100),
      });

      const failedNew = buildMockV1AttemptRow({
        state: 'failed',
        endedAt: brandSchemas.instant.parse(5000),
        claimedAt: brandSchemas.instant.parse(1200),
      });

      const forgotten = buildMockV1AttemptRow({
        state: 'succeeded',
        endedAt: brandSchemas.instant.parse(2000),
        sessionForgottenAt: brandSchemas.instant.parse(2500),
        claimedAt: brandSchemas.instant.parse(1300),
      });

      const running = buildMockV1AttemptRow({ claimedAt: brandSchemas.instant.parse(1400) });

      await store.exclusive(async (transaction) => {
        for (const attempt of [succeeded, failedOld, failedNew, forgotten, running]) {
          await transaction.applyChange(
            buildMockFileItemChange(buildMockV1ItemRow({ id: attempt.item })),
          );

          await transaction.applyChange(buildMockClaimChange(attempt));
        }
      });

      const listed = await store.read((transaction) =>
        transaction.listSessionsToForget(
          brandSchemas.instant.parse(3000),
          brandSchemas.instant.parse(1500),
        ),
      );

      return {
        received: listed.map((attempt) => attempt.id),
        expected: [succeeded.id, failedOld.id],
      };
    },
  ],
  [
    '#listSessionsToForget leaves out a kept session, a recent unstopped stray and an older attempt',
    async (store) => {
      const keptSession = brandSchemas.atcSessionId.parse('atc-session-1');

      const kept = buildMockV1AttemptRow({
        state: 'succeeded',
        atcSession: keptSession,
        endedAt: brandSchemas.instant.parse(2000),
        claimedAt: brandSchemas.instant.parse(1000),
      });

      const stray = buildMockV1AttemptRow({
        state: 'failed',
        endedAt: brandSchemas.instant.parse(2000),
        strayedAt: brandSchemas.instant.parse(2000),
        claimedAt: brandSchemas.instant.parse(1100),
      });

      const older = buildMockV1AttemptRow({
        state: 'succeeded',
        endedAt: brandSchemas.instant.parse(2000),
        claimedAt: brandSchemas.instant.parse(1200),
      });

      const newer = buildMockV1AttemptRow({
        item: older.item,
        phase: brandSchemas.phaseName.parse('review'),
        atcSession: older.atcSession,
        claimedAt: brandSchemas.instant.parse(2500),
      });

      const keptItem = buildMockV1ItemRow({
        id: kept.item,
        keptSession: {
          atcSession: keptSession,
          target: 'worker-host-a',
          attempt: kept.id,
          keptAt: brandSchemas.instant.parse(2000),
          caller: null,
        },
      });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(keptItem));

        await transaction.applyChange(
          buildMockFileItemChange(buildMockV1ItemRow({ id: stray.item })),
        );

        await transaction.applyChange(
          buildMockFileItemChange(buildMockV1ItemRow({ id: older.item })),
        );

        for (const attempt of [kept, stray, older, newer]) {
          await transaction.applyChange(buildMockClaimChange(attempt));
        }
      });

      const listed = await store.read((transaction) =>
        transaction.listSessionsToForget(
          brandSchemas.instant.parse(3000),
          brandSchemas.instant.parse(1500),
        ),
      );

      return { received: listed, expected: [] };
    },
  ],
  [
    '#listSessionsToForget lists an unstopped stray that strayed before the stray cutoff',
    async (store) => {
      const stray = buildMockV1AttemptRow({
        state: 'succeeded',
        endedAt: brandSchemas.instant.parse(2000),
        strayedAt: brandSchemas.instant.parse(2000),
      });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(
          buildMockFileItemChange(buildMockV1ItemRow({ id: stray.item })),
        );

        await transaction.applyChange(buildMockClaimChange(stray));
      });

      const listed = await store.read((transaction) =>
        transaction.listSessionsToForget(
          brandSchemas.instant.parse(3000),
          brandSchemas.instant.parse(2001),
        ),
      );

      return { received: listed.map((attempt) => attempt.id), expected: [stray.id] };
    },
  ],
  [
    '#listSessionsToForget leaves out an unstopped stray that strayed at the stray cutoff',
    async (store) => {
      const stray = buildMockV1AttemptRow({
        state: 'succeeded',
        endedAt: brandSchemas.instant.parse(2000),
        strayedAt: brandSchemas.instant.parse(2000),
      });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(
          buildMockFileItemChange(buildMockV1ItemRow({ id: stray.item })),
        );

        await transaction.applyChange(buildMockClaimChange(stray));
      });

      const listed = await store.read((transaction) =>
        transaction.listSessionsToForget(
          brandSchemas.instant.parse(3000),
          brandSchemas.instant.parse(2000),
        ),
      );

      return { received: listed.map((attempt) => attempt.id), expected: [] };
    },
  ],
  [
    '#listStrayAttempts returns the strays since a time whose session has not stopped',
    async (store) => {
      const recent = buildMockV1AttemptRow({
        state: 'failed',
        strayedAt: brandSchemas.instant.parse(5000),
      });

      const stopped = buildMockV1AttemptRow({
        state: 'failed',
        strayedAt: brandSchemas.instant.parse(5000),
        sessionStoppedAt: brandSchemas.instant.parse(5500),
      });

      const old = buildMockV1AttemptRow({
        state: 'failed',
        strayedAt: brandSchemas.instant.parse(1000),
      });

      await store.exclusive(async (transaction) => {
        for (const attempt of [recent, stopped, old]) {
          await transaction.applyChange(
            buildMockFileItemChange(buildMockV1ItemRow({ id: attempt.item })),
          );

          await transaction.applyChange(buildMockClaimChange(attempt));
        }
      });

      const listed = await store.read((transaction) =>
        transaction.listStrayAttempts(brandSchemas.instant.parse(4000)),
      );

      return { received: listed.map((attempt) => attempt.id), expected: [recent.id] };
    },
  ],
];
