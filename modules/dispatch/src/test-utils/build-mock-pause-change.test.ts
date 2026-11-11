import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockPauseChange } from './build-mock-pause-change.ts';

test('it builds a change that pauses a running runner and writes no fact', () => {
  const runner = brandSchemas.runnerId.parse('runner-1');
  const change: unknown = buildMockPauseChange(runner);

  expect(change).toStrictEqual({
    at: 1500,
    writes: [
      {
        op: 'update',
        table: 'runners',
        key: { id: 'runner-1' },
        expect: { paused: false },
        set: { paused: true },
      },
    ],
    facts: [],
  });
});
