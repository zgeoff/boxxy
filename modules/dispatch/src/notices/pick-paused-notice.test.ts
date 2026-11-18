import { expect, test } from 'bun:test';
import type { Instant, RunnerRow } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { pickPausedNotice } from './pick-paused-notice.ts';

test('it picks the notice of a runner paused for two hours with an item waiting', () => {
  const runner: RunnerRow = {
    id: brandSchemas.runnerId.parse('runner-1'),
    heartbeatAt: brandSchemas.instant.parse(0),
    paused: true,
    pausedAt: brandSchemas.instant.parse(1000),
    pausedBy: 'boxxy:owner:local',
    pauseReason: 'the rules change is in review',
    pauseNoticedAt: null,
  };

  expect(pickPausedNotice(runner, 4, brandSchemas.instant.parse(7_201_000))).toStrictEqual({
    pausedAt: brandSchemas.instant.parse(1000),
    pausedBy: 'boxxy:owner:local',
    reason: 'the rules change is in review',
    waiting: 4,
  });
});

test.each<readonly [string, Partial<RunnerRow> | null, number, number]>([
  ['no runner row', null, 4, 7_201_000],
  ['a running runner', { paused: false }, 4, 7_201_000],
  ['a pause that is not yet two hours old', {}, 4, 7_200_999],
  ['no item ready', {}, 0, 7_201_000],
  [
    'a pause that has its notice',
    { pauseNoticedAt: brandSchemas.instant.parse(5000) },
    4,
    7_201_000,
  ],
  ['a pause with no recorded time', { pausedAt: null }, 4, 7_201_000],
])('it picks no notice for %s', (_title, overrides, waiting, now) => {
  const runner: RunnerRow | null =
    overrides === null
      ? null
      : {
          id: brandSchemas.runnerId.parse('runner-1'),
          heartbeatAt: brandSchemas.instant.parse(0),
          paused: true,
          pausedAt: brandSchemas.instant.parse(1000),
          pausedBy: 'boxxy:owner:local',
          pauseReason: null,
          pauseNoticedAt: null,
          ...overrides,
        };

  const at: Instant = brandSchemas.instant.parse(now);

  expect(pickPausedNotice(runner, waiting, at)).toBeNull();
});
