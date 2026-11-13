import { expect, test } from 'bun:test';
import { stageTimeSchema } from './stage-time-schema.ts';

test('it accepts the stage times of an item that has not reached deploy', () => {
  const times = {
    item: 'boxxy:item:0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
    environment: 'production',
    steps: [
      { step: 'triage', minutes: 4, endedAt: '2026-01-05T02:04:00.000Z' },
      { step: 'deploy', minutes: null, endedAt: null },
    ],
    rework: { count: 1, minutes: 38, unrelatedLines: 12 },
    reviewWaitMinutes: null,
    sleepMinutes: 0,
    pullRequests: ['github:pull_request:9001'],
  };

  const parsed: unknown = stageTimeSchema.safeParse(times).data;

  expect(parsed).toStrictEqual(times);
});

test('it rejects a step that is not a stage step', () => {
  const times = { steps: [{ step: 'plan', minutes: 1, endedAt: null }] };

  expect(stageTimeSchema.safeParse(times).error?.issues).toPartiallyContain({
    path: ['steps', 0, 'step'],
  });
});
