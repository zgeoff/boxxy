import { expect } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockV1ItemRow } from '@boxxy/model/test-utils/build-mock-v1-item-row';
import { buildMockClaimChange } from './build-mock-claim-change.ts';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';
import { buildMockPauseChange } from './build-mock-pause-change.ts';
import { buildMockPullRequestChange } from './build-mock-pull-request-change.ts';
import { buildMockSettleChange } from './build-mock-settle-change.ts';
import { buildMockStartChange } from './build-mock-start-change.ts';
import type { ClaimStoreCase } from './types.ts';

export const claimStoreAttemptReaderCases: readonly ClaimStoreCase[] = [
  [
    '#readLastLeaseGen returns 0 for an item phase with no lease',
    async (store) => {
      const generation = await store.read((transaction) =>
        transaction.readLastLeaseGen(
          buildMockV1ItemRow().id,
          brandSchemas.phaseName.parse('build'),
        ),
      );

      return { received: generation, expected: 0 };
    },
  ],
  [
    '#readLastLeaseGen returns the highest gen after a released lease',
    async (store) => {
      const item = buildMockV1ItemRow();
      const attempt = buildMockV1AttemptRow({ item: item.id, state: 'starting', leaseGen: 3 });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt));
        await transaction.applyChange(buildMockSettleChange({ attempt, state: 'failed' }));
      });

      const generation = await store.read((transaction) =>
        transaction.readLastLeaseGen(item.id, attempt.phase),
      );

      return { received: generation, expected: 3 };
    },
  ],
  [
    '#listLiveAttempts returns every attempt that has not settled, a sleeping one too',
    async (store) => {
      const live = buildMockV1AttemptRow({
        state: 'starting',
        claimedAt: brandSchemas.instant.parse(1000),
      });

      const sleeping = buildMockV1AttemptRow({
        state: 'sleeping',
        claimedAt: brandSchemas.instant.parse(1100),
      });

      const settled = buildMockV1AttemptRow({ state: 'starting' });

      await store.exclusive(async (transaction) => {
        for (const attempt of [live, sleeping, settled]) {
          await transaction.applyChange(
            buildMockFileItemChange(buildMockV1ItemRow({ id: attempt.item })),
          );

          await transaction.applyChange(buildMockClaimChange(attempt));
        }

        await transaction.applyChange(buildMockSettleChange({ attempt: settled, state: 'failed' }));
      });

      const listed = await store.read((transaction) => transaction.listLiveAttempts());

      return { received: listed.map((attempt) => attempt.id), expected: [live.id, sleeping.id] };
    },
  ],
  [
    '#listItemAttempts returns the attempts of one item, oldest first',
    async (store) => {
      const item = buildMockV1ItemRow();

      const second = buildMockV1AttemptRow({
        item: item.id,
        state: 'starting',
        number: 2,
        leaseGen: 2,
        claimedAt: brandSchemas.instant.parse(4000),
      });

      const first = buildMockV1AttemptRow({
        item: item.id,
        state: 'starting',
        claimedAt: brandSchemas.instant.parse(1000),
      });

      const other = buildMockV1AttemptRow({ state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));

        await transaction.applyChange(
          buildMockFileItemChange(buildMockV1ItemRow({ id: other.item })),
        );

        await transaction.applyChange(buildMockClaimChange(first));
        await transaction.applyChange(buildMockSettleChange({ attempt: first, state: 'failed' }));
        await transaction.applyChange(buildMockClaimChange(second));
        await transaction.applyChange(buildMockClaimChange(other));
      });

      const listed = await store.read((transaction) => transaction.listItemAttempts(item.id));

      return { received: listed.map((attempt) => attempt.id), expected: [first.id, second.id] };
    },
  ],
  [
    '#listSucceededAttemptsWithoutPullRequest skips an attempt with a linked pull request',
    async (store) => {
      const first = buildMockV1ItemRow();
      const second = buildMockV1ItemRow();
      const linked = buildMockV1AttemptRow({ item: first.id, state: 'starting' });
      const unlinked = buildMockV1AttemptRow({ item: second.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(first));
        await transaction.applyChange(buildMockFileItemChange(second));
        await transaction.applyChange(buildMockClaimChange(linked));
        await transaction.applyChange(buildMockClaimChange(unlinked));

        await transaction.applyChange(
          buildMockSettleChange({ attempt: linked, state: 'succeeded' }),
        );

        await transaction.applyChange(
          buildMockSettleChange({ attempt: unlinked, state: 'succeeded' }),
        );

        await transaction.applyChange(
          buildMockPullRequestChange({ attempt: linked, state: 'open' }),
        );
      });

      const listed = await store.read((transaction) =>
        transaction.listSucceededAttemptsWithoutPullRequest(),
      );

      return { received: listed.map((attempt) => attempt.id), expected: [unlinked.id] };
    },
  ],
  [
    '#findAttemptBySession returns the attempt with an atc session id',
    async (store) => {
      const item = buildMockV1ItemRow();

      const attempt = buildMockV1AttemptRow({
        item: item.id,
        state: 'starting',
        atcSession: brandSchemas.atcSessionId.parse('atc-session-1'),
      });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt));
        await transaction.applyChange(buildMockStartChange(attempt));
      });

      const found = await store.read((transaction) =>
        transaction.findAttemptBySession(brandSchemas.atcSessionId.parse('atc-session-1')),
      );

      return { received: found?.id, expected: attempt.id };
    },
  ],
  [
    '#findAttemptBySession returns the latest of two attempts on one kept session',
    async (store) => {
      const item = buildMockV1ItemRow();
      const atcSession = brandSchemas.atcSessionId.parse('atc-session-1');

      const earlier = buildMockV1AttemptRow({
        item: item.id,
        state: 'starting',
        atcSession,
        claimedAt: brandSchemas.instant.parse(1000),
      });

      const later = buildMockV1AttemptRow({
        item: item.id,
        state: 'starting',
        number: 2,
        leaseGen: 2,
        atcSession,
        claimedAt: brandSchemas.instant.parse(4000),
      });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(earlier));
        await transaction.applyChange(buildMockSettleChange({ attempt: earlier, state: 'failed' }));
        await transaction.applyChange(buildMockClaimChange(later));
      });

      const found = await store.read((transaction) => transaction.findAttemptBySession(atcSession));

      return { received: found?.id, expected: later.id };
    },
  ],
  [
    '#markPullRequestChecked sets the checked time of a watched pull request',
    async (store) => {
      const item = buildMockV1ItemRow();
      const attempt = buildMockV1AttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt));
        await transaction.applyChange(buildMockPullRequestChange({ attempt, state: 'open' }));
      });

      await store.exclusive((transaction) =>
        transaction.markPullRequestChecked(
          { repo: brandSchemas.repoName.parse('acme/lamps'), number: 7 },
          brandSchemas.instant.parse(9000),
        ),
      );

      const watched = await store.read((transaction) => transaction.listWatchedPullRequests());

      return { received: watched[0]?.checkedAt, expected: brandSchemas.instant.parse(9000) };
    },
  ],
  [
    '#readPullRequestRow returns a merged pull request, and null for one never linked',
    async (store) => {
      const item = buildMockV1ItemRow();
      const attempt = buildMockV1AttemptRow({ item: item.id, state: 'starting' });
      const repo = brandSchemas.repoName.parse('acme/lamps');

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt));
        await transaction.applyChange(buildMockPullRequestChange({ attempt, state: 'merged' }));
      });

      const found = await store.read((transaction) =>
        transaction.readPullRequestRow({ repo, number: 7 }),
      );

      const missing = await store.read((transaction) =>
        transaction.readPullRequestRow({ repo, number: 8 }),
      );

      return { received: [found?.state, missing], expected: ['merged', null] };
    },
  ],
  [
    '#listWatchedPullRequests returns an open pull request with its GitHub id and url',
    async (store) => {
      const item = buildMockV1ItemRow();
      const attempt = buildMockV1AttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt));
        await transaction.applyChange(buildMockPullRequestChange({ attempt, state: 'merged' }));

        await transaction.applyChange(
          buildMockPullRequestChange({ attempt, state: 'open', number: 8 }),
        );
      });

      const watched = await store.read((transaction) => transaction.listWatchedPullRequests());

      return {
        received: watched.map((pullRequest) => [
          pullRequest.number,
          pullRequest.githubId,
          pullRequest.url,
        ]),
        expected: [[8, 2_000_008, 'https://github.com/acme/lamps/pull/8']],
      };
    },
  ],
  [
    '#listEvidence returns the evidence of one attempt',
    async (store) => {
      const item = buildMockV1ItemRow();
      const attempt = buildMockV1AttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt));
        await transaction.applyChange(buildMockPullRequestChange({ attempt, state: 'open' }));
      });

      const evidence: unknown = await store.read((transaction) =>
        transaction.listEvidence(attempt.id),
      );

      return {
        received: evidence,
        expected: [
          {
            factId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7/u),
            attempt: attempt.id,
            kind: 'pull_request',
            ref: 'https://github.com/acme/lamps/pull/7',
            observed: null,
            source: 'hook',
            at: 4000,
          },
        ],
      };
    },
  ],
  [
    '#writeHeartbeat inserts the runner row on its first beat, not paused',
    async (store) => {
      const runner = brandSchemas.runnerId.parse('runner-1');

      await store.exclusive((transaction) =>
        transaction.writeHeartbeat(runner, brandSchemas.instant.parse(1000)),
      );

      const read: unknown = await store.read((transaction) => transaction.readRunner(runner));

      return { received: read, expected: { id: 'runner-1', heartbeatAt: 1000, paused: false } };
    },
  ],
  [
    '#writeHeartbeat moves the heartbeat and keeps the paused flag',
    async (store) => {
      const runner = brandSchemas.runnerId.parse('runner-1');

      await store.exclusive(async (transaction) => {
        await transaction.writeHeartbeat(runner, brandSchemas.instant.parse(1000));
        await transaction.applyChange(buildMockPauseChange(runner));
        await transaction.writeHeartbeat(runner, brandSchemas.instant.parse(2000));
      });

      const read: unknown = await store.read((transaction) => transaction.readRunner(runner));

      return { received: read, expected: { id: 'runner-1', heartbeatAt: 2000, paused: true } };
    },
  ],
  [
    '#readRunner returns null before the first heartbeat',
    async (store) => {
      const read = await store.read((transaction) =>
        transaction.readRunner(brandSchemas.runnerId.parse('runner-1')),
      );

      return { received: read, expected: null };
    },
  ],
];
