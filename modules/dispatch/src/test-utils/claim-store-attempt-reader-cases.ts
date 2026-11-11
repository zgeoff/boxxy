import { expect } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockAttemptRow } from '@boxxy/model/test-utils/build-mock-attempt-row';
import { buildMockItemRow } from '@boxxy/model/test-utils/build-mock-item-row';
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
        transaction.readLastLeaseGen(buildMockItemRow().id, brandSchemas.phaseName.parse('build')),
      );

      return { received: generation, expected: 0 };
    },
  ],
  [
    '#readLastLeaseGen returns the highest gen after a released lease',
    async (store) => {
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting', leaseGen: 3 });

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt));

        await transaction.applyChange(
          buildMockSettleChange({ attempt: { ...attempt, slot: 1, slotGen: 1 }, state: 'failed' }),
        );
      });

      const generation = await store.read((transaction) =>
        transaction.readLastLeaseGen(item.id, attempt.phase),
      );

      return { received: generation, expected: 3 };
    },
  ],
  [
    '#listLiveAttempts returns the attempts that have not settled',
    async (store) => {
      const first = buildMockItemRow();
      const second = buildMockItemRow();
      const live = buildMockAttemptRow({ item: first.id, state: 'starting' });
      const settled = buildMockAttemptRow({ item: second.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: live.pool, slots: 2 }]);
        await transaction.applyChange(buildMockFileItemChange(first));
        await transaction.applyChange(buildMockFileItemChange(second));
        await transaction.applyChange(buildMockClaimChange(live));
        await transaction.applyChange(buildMockClaimChange(settled));

        await transaction.applyChange(
          buildMockSettleChange({ attempt: { ...settled, slot: 2, slotGen: 1 }, state: 'failed' }),
        );
      });

      const listed = await store.read((transaction) => transaction.listLiveAttempts());

      return { received: listed.map((attempt) => attempt.id), expected: [live.id] };
    },
  ],
  [
    '#listSucceededAttemptsWithoutPullRequest skips an attempt with a linked pull request',
    async (store) => {
      const first = buildMockItemRow();
      const second = buildMockItemRow();
      const linked = buildMockAttemptRow({ item: first.id, state: 'starting' });
      const unlinked = buildMockAttemptRow({ item: second.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: linked.pool, slots: 2 }]);
        await transaction.applyChange(buildMockFileItemChange(first));
        await transaction.applyChange(buildMockFileItemChange(second));
        await transaction.applyChange(buildMockClaimChange(linked));
        await transaction.applyChange(buildMockClaimChange(unlinked));

        await transaction.applyChange(
          buildMockSettleChange({
            attempt: { ...linked, slot: 1, slotGen: 1 },
            state: 'succeeded',
          }),
        );

        await transaction.applyChange(
          buildMockSettleChange({
            attempt: { ...unlinked, slot: 2, slotGen: 1 },
            state: 'succeeded',
          }),
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
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
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
    '#markPullRequestChecked sets the checked time of a watched pull request',
    async (store) => {
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
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
    '#listWatchedPullRequests returns an open pull request and skips a merged one',
    async (store) => {
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt));
        await transaction.applyChange(buildMockPullRequestChange({ attempt, state: 'merged' }));

        await transaction.applyChange(
          buildMockPullRequestChange({ attempt, state: 'open', number: 8 }),
        );
      });

      const watched = await store.read((transaction) => transaction.listWatchedPullRequests());

      return { received: watched.map((pullRequest) => pullRequest.number), expected: [8] };
    },
  ],
  [
    '#listEvidence returns the evidence of one attempt',
    async (store) => {
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
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
    '#markFactsSent drops the facts from the unsent facts and the outbox lag',
    async (store) => {
      const first = buildMockFileItemChange(
        buildMockItemRow({ filedAt: brandSchemas.instant.parse(1000) }),
      );

      const second = buildMockFileItemChange(
        buildMockItemRow({ filedAt: brandSchemas.instant.parse(2000) }),
      );

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(first);
        await transaction.applyChange(second);
      });

      await store.exclusive((transaction) =>
        transaction.markFactsSent(
          first.facts.map((fact) => fact.id),
          brandSchemas.instant.parse(3000),
        ),
      );

      const outbox: unknown = await store.read(async (transaction) => {
        const unsent = await transaction.readUnsentFacts(10);

        return {
          unsent: unsent.map((fact) => fact.factId),
          lag: await transaction.readOutboxLag(),
        };
      });

      return {
        received: outbox,
        expected: {
          unsent: second.facts.map((fact) => fact.id),
          lag: { unsent: 1, oldestUnsentAt: 2000 },
        },
      };
    },
  ],
  [
    '#readUnsentFacts returns at most the limit, oldest first',
    async (store) => {
      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(buildMockItemRow()));
        await transaction.applyChange(buildMockFileItemChange(buildMockItemRow()));
      });

      const unsent = await store.read((transaction) => transaction.readUnsentFacts(1));

      return { received: unsent.map((fact) => fact.seq), expected: [1] };
    },
  ],
  [
    '#readOutboxLag reads no lag from an empty outbox',
    async (store) => {
      const lag: unknown = await store.read((transaction) => transaction.readOutboxLag());

      return { received: lag, expected: { unsent: 0, oldestUnsentAt: null } };
    },
  ],
  [
    '#readOutboxLag reads the earliest time of the unsent facts, whatever their order',
    async (store) => {
      const later = buildMockItemRow({ filedAt: brandSchemas.instant.parse(2000) });
      const earlier = buildMockItemRow({ filedAt: brandSchemas.instant.parse(1000) });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(later));
        await transaction.applyChange(buildMockFileItemChange(earlier));
      });

      const lag: unknown = await store.read((transaction) => transaction.readOutboxLag());

      return { received: lag, expected: { unsent: 2, oldestUnsentAt: 1000 } };
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
