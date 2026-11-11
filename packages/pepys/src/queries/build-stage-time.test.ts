import { expect, test } from 'bun:test';
import { stageTimeSchema } from '@boxxy/model';
import { buildMockAttemptReadRow } from '../test-utils/build-mock-attempt-read-row.ts';
import { buildStageTime } from './build-stage-time.ts';

test('it gives the minutes of all seven steps, the rework, the review wait and the sleep time', () => {
  const times = buildStageTime({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    environment: 'production',
    attempts: [
      buildMockAttemptReadRow({
        number: 1,
        phase: 'triage',
        outcome: 'accepted',
        claimed_at: '2026-11-11T02:01:00.000Z',
        ended_at: '2026-11-11T02:05:00.000Z',
      }),
      buildMockAttemptReadRow({
        number: 1,
        phase: 'build',
        outcome: 'built',
        claimed_at: '2026-11-11T02:10:00.000Z',
        ended_at: '2026-11-11T03:10:00.000Z',
        sleeps: JSON.stringify([
          { from: '2026-11-11T02:30:00.000Z', to: '2026-11-11T02:50:00.000Z' },
        ]),
      }),
      buildMockAttemptReadRow({
        number: 1,
        phase: 'review',
        outcome: 'changes-requested',
        claimed_at: '2026-11-11T03:16:00.000Z',
        ended_at: '2026-11-11T03:36:00.000Z',
      }),
      buildMockAttemptReadRow({
        number: 2,
        phase: 'build',
        round: 2,
        outcome: 'built',
        claimed_at: '2026-11-11T03:40:00.000Z',
        ended_at: '2026-11-11T04:10:00.000Z',
      }),
      buildMockAttemptReadRow({
        number: 2,
        phase: 'review',
        round: 2,
        outcome: 'passed',
        claimed_at: '2026-11-11T04:12:00.000Z',
        ended_at: '2026-11-11T04:30:00.000Z',
      }),
    ],
    deliveries: [
      {
        pullRequest: 'github:pull_request:9001',
        mergedAt: '2026-11-11T05:00:00Z',
        release: { at: '2026-11-11T05:30:00Z' },
        deploy: { at: '2026-11-11T06:10:00Z' },
      },
    ],
  });

  expect(times).toStrictEqual({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    environment: 'production',
    steps: [
      { step: 'triage', minutes: 4, endedAt: '2026-11-11T02:05:00.000Z' },
      { step: 'design', minutes: null, endedAt: null },
      { step: 'build', minutes: 70, endedAt: '2026-11-11T04:10:00.000Z' },
      { step: 'review', minutes: 38, endedAt: '2026-11-11T04:30:00.000Z' },
      { step: 'merge', minutes: 30, endedAt: '2026-11-11T05:00:00Z' },
      { step: 'release', minutes: 30, endedAt: '2026-11-11T05:30:00Z' },
      { step: 'deploy', minutes: 40, endedAt: '2026-11-11T06:10:00Z' },
    ],
    rework: { count: 1, minutes: 48 },
    reviewWaitMinutes: 8,
    sleepMinutes: 20,
    pullRequests: ['github:pull_request:9001'],
  });
});

test('it gives the four phases of an item that has no pull request yet', () => {
  const times = buildStageTime({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    environment: 'production',
    attempts: [
      buildMockAttemptReadRow({
        number: 1,
        phase: 'triage',
        outcome: 'accepted',
        claimed_at: '2026-11-11T02:01:00.000Z',
        ended_at: '2026-11-11T02:05:00.000Z',
      }),
      buildMockAttemptReadRow({
        number: 2,
        phase: 'build',
        outcome: 'built',
        claimed_at: '2026-11-11T02:10:00.000Z',
        ended_at: '2026-11-11T03:10:00.000Z',
      }),
    ],
    deliveries: [],
  });

  expect([times.steps.map((step) => step.minutes), times.pullRequests]).toStrictEqual([
    [4, null, 60, null, null, null, null],
    [],
  ]);
});

test('it counts the time of an unsettleable, a timed-out and a closed attempt in its phase, and none of them as rework', () => {
  const times = buildStageTime({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    environment: 'production',
    attempts: [
      buildMockAttemptReadRow({
        number: 1,
        phase: 'design',
        state: 'failed',
        outcome: 'lost',
        failure: 'item-closed',
        claimed_at: '2026-11-11T02:00:00.000Z',
        ended_at: '2026-11-11T03:30:00.000Z',
        sleeps: [{ from: '2026-11-11T03:00:00.000Z', to: '2026-11-11T03:30:00.000Z' }],
      }),
      buildMockAttemptReadRow({
        number: 2,
        phase: 'build',
        state: 'failed',
        outcome: 'lost',
        failure: 'timed-out',
        claimed_at: '2026-11-11T04:00:00.000Z',
        ended_at: '2026-11-11T04:25:00.000Z',
      }),
      buildMockAttemptReadRow({
        number: 3,
        phase: 'review',
        state: 'failed',
        outcome: 'unsettleable',
        failure: 'closeout-unsettleable',
        claimed_at: '2026-11-11T05:00:00.000Z',
        ended_at: '2026-11-11T05:10:00.000Z',
      }),
    ],
    deliveries: [],
  });

  expect({
    minutes: times.steps.map((step) => step.minutes),
    rework: times.rework,
    reviewWaitMinutes: times.reviewWaitMinutes,
    sleepMinutes: times.sleepMinutes,
  }).toStrictEqual({
    minutes: [null, 60, 25, 10, null, null, null],
    rework: { count: 0, minutes: 0 },
    reviewWaitMinutes: null,
    sleepMinutes: 30,
  });
});

test('it starts no merge step from a review that settled unsettleable, after its pull request merged', () => {
  const times = buildStageTime({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    environment: 'production',
    attempts: [
      buildMockAttemptReadRow({
        number: 1,
        phase: 'review',
        state: 'failed',
        outcome: 'unsettleable',
        failure: 'closeout-unsettleable',
        claimed_at: '2026-11-11T05:00:00.000Z',
        ended_at: '2026-11-11T05:10:00.000Z',
      }),
    ],
    deliveries: [
      {
        pullRequest: 'github:pull_request:9001',
        mergedAt: '2026-11-11T05:40:00Z',
        release: null,
        deploy: null,
      },
    ],
  });

  expect(times.steps[4]).toStrictEqual({
    step: 'merge',
    minutes: null,
    endedAt: '2026-11-11T05:40:00Z',
  });
});

test('it leaves a no-capacity attempt out of every measure, and counts a usage-limit attempt', () => {
  const times = buildStageTime({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    environment: 'production',
    attempts: [
      buildMockAttemptReadRow({
        number: 1,
        phase: 'build',
        outcome: 'built',
        claimed_at: '2026-11-11T02:00:00.000Z',
        ended_at: '2026-11-11T02:30:00.000Z',
      }),
      buildMockAttemptReadRow({
        number: 2,
        phase: 'review',
        state: 'failed',
        outcome: 'lost',
        failure: 'no-capacity',
        claimed_at: '2026-11-11T02:31:00.000Z',
        ended_at: '2026-11-11T02:31:00.000Z',
      }),
      buildMockAttemptReadRow({
        number: 3,
        phase: 'review',
        round: 2,
        state: 'failed',
        outcome: 'lost',
        failure: 'no-capacity',
        claimed_at: '2026-11-11T02:32:00.000Z',
        ended_at: '2026-11-11T02:40:00.000Z',
      }),
      buildMockAttemptReadRow({
        number: 4,
        phase: 'review',
        state: 'failed',
        outcome: 'lost',
        failure: 'usage-limit',
        claimed_at: '2026-11-11T02:45:00.000Z',
        ended_at: '2026-11-11T02:55:00.000Z',
      }),
    ],
    deliveries: [],
  });

  expect({
    review: times.steps[3],
    rework: times.rework,
    reviewWaitMinutes: times.reviewWaitMinutes,
  }).toStrictEqual({
    review: { step: 'review', minutes: 10, endedAt: '2026-11-11T02:55:00.000Z' },
    rework: { count: 0, minutes: 0 },
    reviewWaitMinutes: 15,
  });
});

test('it takes the earliest time of each delivery step of an item with two pull requests', () => {
  const times = buildStageTime({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    environment: 'production',
    attempts: [
      buildMockAttemptReadRow({
        number: 1,
        phase: 'review',
        outcome: 'passed',
        claimed_at: '2026-11-11T04:00:00.000Z',
        ended_at: '2026-11-11T04:30:00.000Z',
      }),
    ],
    deliveries: [
      {
        pullRequest: 'github:pull_request:9002',
        mergedAt: '2026-11-11T05:20:00Z',
        release: { at: '2026-11-11T05:50:00Z' },
        deploy: null,
      },
      {
        pullRequest: 'github:pull_request:9001',
        mergedAt: '2026-11-11T05:00:00Z',
        release: null,
        deploy: null,
      },
    ],
  });

  expect([times.steps.slice(4), times.pullRequests]).toStrictEqual([
    [
      { step: 'merge', minutes: 30, endedAt: '2026-11-11T05:00:00Z' },
      { step: 'release', minutes: 50, endedAt: '2026-11-11T05:50:00Z' },
      { step: 'deploy', minutes: null, endedAt: null },
    ],
    ['github:pull_request:9001', 'github:pull_request:9002'],
  ]);
});

test('it gives seven steps with null minutes, which the schema accepts, for an item pepys holds no fact of', () => {
  const times = buildStageTime({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    environment: 'production',
    attempts: [],
    deliveries: [],
  });

  expect(stageTimeSchema.parse(times).steps).toStrictEqual([
    { step: 'triage', minutes: null, endedAt: null },
    { step: 'design', minutes: null, endedAt: null },
    { step: 'build', minutes: null, endedAt: null },
    { step: 'review', minutes: null, endedAt: null },
    { step: 'merge', minutes: null, endedAt: null },
    { step: 'release', minutes: null, endedAt: null },
    { step: 'deploy', minutes: null, endedAt: null },
  ]);
});

test('it takes the review wait from the review claimed next after each build, as each phase numbers its own attempts', () => {
  const times = buildStageTime({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    environment: 'production',
    attempts: [
      buildMockAttemptReadRow({
        number: 1,
        phase: 'build',
        outcome: 'built',
        claimed_at: '2026-11-11T02:10:00.000Z',
        ended_at: '2026-11-11T03:10:00.000Z',
      }),
      buildMockAttemptReadRow({
        number: 1,
        phase: 'review',
        outcome: 'changes-requested',
        claimed_at: '2026-11-11T03:13:00.000Z',
        ended_at: '2026-11-11T03:36:00.000Z',
      }),
      buildMockAttemptReadRow({
        number: 2,
        phase: 'build',
        round: 2,
        outcome: 'built',
        claimed_at: '2026-11-11T03:40:00.000Z',
        ended_at: '2026-11-11T04:10:00.000Z',
      }),
      buildMockAttemptReadRow({
        number: 2,
        phase: 'review',
        round: 2,
        outcome: 'passed',
        claimed_at: '2026-11-11T04:12:00.000Z',
        ended_at: '2026-11-11T04:30:00.000Z',
      }),
    ],
    deliveries: [],
  });

  expect(times.reviewWaitMinutes).toBe(5);
});
