import { expect, test } from 'bun:test';
import { makeTargetCheck } from './make-target-check.ts';

test('it runs the check on its own target', async () => {
  const check = makeTargetCheck('local', () => Promise.resolve({ shelves: 3 }));

  const data = await check({}, { target: 'local' });

  expect(data).toStrictEqual({ shelves: 3 });
});

test('it passes without running the check on another target', async () => {
  const check = makeTargetCheck('local', () => Promise.reject(new Error('the check ran')));

  const data = await check({}, { target: 'prod' });

  expect(data).toStrictEqual({ skipped: 'runs on local only, not on prod' });
});
