import { expect, test } from 'bun:test';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { createFakeJob } from './create-fake-job.ts';

test('it throws on the read after a failure is set, and answers the read after it', async () => {
  const job = createFakeJob();
  const attempt = buildMockV1AttemptRow();

  job.failNextRead(new Error('the forge did not answer'));

  const first = await job.worker.read(attempt).then(
    () => 'answered',
    () => 'threw',
  );

  expect([first, await job.worker.read(attempt), job.reads]).toStrictEqual([
    'threw',
    { kind: 'running', observed: { read: 1 } },
    [attempt],
  ]);
});

test('it runs the hook inside the next read only', async () => {
  const job = createFakeJob();
  const attempt = buildMockV1AttemptRow();
  const calls: string[] = [];

  job.beforeNextRead(() => {
    calls.push('hook');

    return Promise.resolve();
  });

  await job.worker.read(attempt);
  await job.worker.read(attempt);

  expect(calls).toStrictEqual(['hook']);
});
