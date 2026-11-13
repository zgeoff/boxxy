import { expect, test } from 'bun:test';
import type { AttemptRow } from '@boxxy/model';
import { brandSchemas, toJSONValue } from '@boxxy/model';
import { buildMockMergeAction } from '@boxxy/model/test-utils/build-mock-merge-action';
import { buildMockMergeCloseOut } from '@boxxy/model/test-utils/build-mock-merge-close-out';
import invariant from 'tiny-invariant';
import { claimNext } from '../claims/claim-next.ts';
import { createFakeJob } from '../test-utils/create-fake-job.ts';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { loadJobRules } from '../test-utils/load-job-rules.ts';
import { timeouts } from '../timeouts.ts';
import { runJobReading } from './run-job-reading.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  const job = createFakeJob();
  const rules = loadJobRules(job.drive);

  dispatch.setRules(rules);

  await dispatch.store.exclusive((tx) => tx.syncLimits(rules.limits, dispatch.clock.now()));

  const step = rules.kinds
    .get(brandSchemas.itemKindName.parse('core.issue'))
    ?.pipeline.steps.find((candidate) => candidate.phase === 'merge');

  invariant(step !== undefined, 'the job rules have a merge step');

  return {
    ...dispatch,
    job,
    claimMerge: async () => {
      const item = await dispatch.seedItem({ phase: brandSchemas.phaseName.parse('merge') });

      const claim = await claimNext({
        store: dispatch.store,
        runner: dispatch.runner,
        rules,
        backoff: dispatch.backoff,
        spawn: dispatch.spawn,
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      });

      invariant(claim?.attempt.item === item, 'the claim picks the seeded merge item');

      return claim.attempt;
    },
    read: async (attempt: AttemptRow) => {
      const row = await dispatch.readAttempt(attempt.id);

      return runJobReading({
        store: dispatch.store,
        runner: dispatch.runner,
        job: job.worker,
        rules,
        attempt: row,
        step,
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      });
    },
    releaseLease: (attempt: AttemptRow) =>
      dispatch.store.exclusive((tx) =>
        tx.applyChange({
          at: dispatch.clock.now(),
          writes: [
            {
              op: 'update',
              table: 'leases',
              key: { item: attempt.item, phase: attempt.phase, gen: attempt.leaseGen },
              expect: { attempt: attempt.id, releasedAt: null },
              set: { releasedAt: dispatch.clock.now() },
            },
          ],
          facts: [],
        }),
      ),
  };
}

test('it claims a merge on its job worker with a jobs seat', async () => {
  const ctx = await setupTest();
  const claimed = await ctx.claimMerge();

  const seen: unknown = {
    state: claimed.state,
    worker: claimed.worker,
    seats: await ctx.heldSeats(claimed.id),
  };

  expect(seen).toStrictEqual({ state: 'starting', worker: 'merge.forge', seats: ['jobs'] });
});

test('it moves a starting job to running on its first read and records the job start', async () => {
  const ctx = await setupTest();
  const claimed = await ctx.claimMerge();

  await ctx.read(claimed);

  const row = await ctx.readAttempt(claimed.id);
  const facts = await ctx.listFacts('boxxy.attempt.job_started');

  expect([row.state, facts.map((fact) => fact.payload)]).toStrictEqual([
    'running',
    [{ attempt: claimed.id, worker: 'merge.forge' }],
  ]);
});

test('it leaves a starting job as it is when its first read throws', async () => {
  const ctx = await setupTest();
  const claimed = await ctx.claimMerge();

  ctx.job.failNextRead(new Error('the forge did not answer'));

  expect(ctx.read(claimed)).rejects.toThrow('the forge did not answer');

  const row = await ctx.readAttempt(claimed.id);

  expect([row.state, await ctx.listFacts('boxxy.attempt.job_started')]).toStrictEqual([
    'starting',
    [],
  ]);
});

test('it records the reason and the time of a read that waits', async () => {
  const ctx = await setupTest();
  const claimed = await ctx.claimMerge();

  ctx.job.setStep({ kind: 'wait', reason: 'checks pending', pending: ['pr / checks'] });

  await ctx.read(claimed);

  const row = await ctx.readAttempt(claimed.id);

  expect([row.state, row.readAt, row.waitReason]).toStrictEqual([
    'running',
    ctx.clock.now(),
    'checks pending',
  ]);
});

test('it reads a waiting job again only after the job read time', async () => {
  const ctx = await setupTest();
  const claimed = await ctx.claimMerge();

  await ctx.read(claimed);

  ctx.clock.advance(timeouts.jobReadSeconds * 1000 - 1);

  await ctx.read(claimed);

  ctx.clock.advance(1);

  await ctx.read(claimed);

  expect(ctx.job.reads).toHaveLength(2);
});

test('it marks the action and records the request before it sends the call', async () => {
  const ctx = await setupTest();
  const claimed = await ctx.claimMerge();

  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');
  const action = buildMockMergeAction(head);

  ctx.job.setStep({ kind: 'act', action });

  await ctx.read(claimed);

  const requested = await ctx.listFacts('boxxy.merge.requested');

  expect({
    acts: ctx.job.acts.map((act) => [act.attempt.state, act.attempt.id, act.action]),
    requested: requested.map((fact) => fact.payload),
  }).toStrictEqual({
    acts: [['running', claimed.id, action]],
    requested: [
      {
        attempt: claimed.id,
        repo: 'example/app',
        number: expect.any(Number),
        head,
        method: 'squash',
        required: ['pr / checks'],
      },
    ],
  });
});

test('it stores the mark of the action on the attempt', async () => {
  const ctx = await setupTest();
  const claimed = await ctx.claimMerge();

  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');

  ctx.job.setStep({ kind: 'act', action: buildMockMergeAction(head) });

  await ctx.read(claimed);

  const row = await ctx.readAttempt(claimed.id);

  expect([row.actedAt, row.actedHead, row.actedAnswer, row.readAt]).toStrictEqual([
    ctx.clock.now(),
    head,
    null,
    ctx.clock.now(),
  ]);
});

test('it records the answer to the call on the attempt and in a fact', async () => {
  const ctx = await setupTest();
  const claimed = await ctx.claimMerge();

  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');
  const mergeCommit = brandSchemas.commitSha.parse('4b825dc642cb6eb9a060e54bf8d69288fbee4904');

  ctx.job.setStep({ kind: 'act', action: buildMockMergeAction(head) });
  ctx.job.setAnswer({ kind: 'merged', mergeCommit });

  await ctx.read(claimed);

  const row = await ctx.readAttempt(claimed.id);
  const answered = await ctx.listFacts('boxxy.merge.answered');

  expect([row.actedAnswer, answered.map((fact) => fact.payload)]).toStrictEqual([
    { kind: 'merged', mergeCommit },
    [{ attempt: claimed.id, head, answer: 'merged', mergeCommit }],
  ]);
});

test('it writes no answer for a call that got none', async () => {
  const ctx = await setupTest();
  const claimed = await ctx.claimMerge();

  ctx.job.setStep({ kind: 'act', action: buildMockMergeAction() });

  await ctx.read(claimed);

  const row = await ctx.readAttempt(claimed.id);

  expect([row.actedAnswer, await ctx.listFacts('boxxy.merge.answered')]).toStrictEqual([null, []]);
});

test('it sends no call when the store refuses the mark because the lease is gone', async () => {
  const ctx = await setupTest();
  const claimed = await ctx.claimMerge();

  await ctx.read(claimed);

  ctx.clock.advance(timeouts.jobReadSeconds * 1000);
  ctx.job.setStep({ kind: 'act', action: buildMockMergeAction() });

  ctx.job.beforeNextRead(async () => {
    await ctx.releaseLease(claimed);
  });

  await ctx.read(claimed);

  expect([ctx.job.acts, await ctx.listFacts('boxxy.merge.requested')]).toStrictEqual([[], []]);
});

test('it sends one call when two runners read the same unmarked job at once', async () => {
  const ctx = await setupTest();
  const claimed = await ctx.claimMerge();

  await ctx.read(claimed);

  ctx.clock.advance(timeouts.jobReadSeconds * 1000);
  ctx.job.setStep({ kind: 'act', action: buildMockMergeAction() });

  await Promise.all([ctx.read(claimed), ctx.read(claimed)]);

  const requested = await ctx.listFacts('boxxy.merge.requested');

  expect([ctx.job.acts.length, requested.length]).toStrictEqual([1, 1]);
});

test('it records the close-out the drive built and settles the job in the same read', async () => {
  const ctx = await setupTest();
  const claimed = await ctx.claimMerge();

  const closeOut = buildMockMergeCloseOut();

  ctx.job.setStep({ kind: 'finish', closeOut: toJSONValue(closeOut) });

  await ctx.read(claimed);

  const closedOut = await ctx.listFacts('boxxy.attempt.closed_out');
  const row = await ctx.readAttempt(claimed.id);

  const seen: unknown = {
    attempt: [row.state, row.outcome, row.closeOut],
    closedOut: closedOut.map((fact) => [fact.actor, fact.payload]),
    seats: await ctx.heldSeats(claimed.id),
  };

  expect(seen).toStrictEqual({
    attempt: ['succeeded', 'merged', closeOut],
    closedOut: [
      [
        'boxxy:runner:runner-1',
        { attempt: claimed.id, phase: 'merge', closeOut, hash: expect.any(String) },
      ],
    ],
    seats: [],
  });
});

test('it settles a job unsettleable and reports the fault when its phase refuses the close-out', async () => {
  const ctx = await setupTest();
  const claimed = await ctx.claimMerge();

  ctx.job.setStep({ kind: 'finish', closeOut: { outcome: 'merged' } });

  const fault = await ctx.read(claimed);
  const row = await ctx.readAttempt(claimed.id);

  expect([fault, [row.state, row.failure, row.outcome]]).toStrictEqual([
    { fault: 'job-close-out-refused', attempt: claimed.id, problems: expect.any(Array) },
    ['failed', 'closeout-unsettleable', 'unsettleable'],
  ]);
});

test('it settles a job that the close of its item moved to closing', async () => {
  const ctx = await setupTest();
  const claimed = await ctx.claimMerge();

  await ctx.read(claimed);
  await ctx.closeItem(claimed.item, 'not needed');
  await ctx.read(claimed);

  const row = await ctx.readAttempt(claimed.id);

  expect([row.state, row.failure, row.outcome]).toStrictEqual(['failed', 'item-closed', 'lost']);
});

test('it tells the drive that the deadline passed after the step time limit', async () => {
  const ctx = await setupTest();
  const claimed = await ctx.claimMerge();

  ctx.job.setStep(
    { kind: 'wait', reason: 'checks pending', pending: [] },
    {
      kind: 'finish',
      closeOut: toJSONValue(buildMockMergeCloseOut({ outcome: 'stalled', byBoxxy: false })),
    },
  );

  ctx.clock.advance(240 * 60_000 + 1);

  await ctx.read(claimed);

  const row = await ctx.readAttempt(claimed.id);

  expect(row.outcome).toBe(brandSchemas.outcomeName.parse('stalled'));
});

test('it gives the drive the time after which an unanswered action is sent again', async () => {
  const ctx = await setupTest();
  const claimed = await ctx.claimMerge();

  await ctx.read(claimed);

  expect(ctx.job.drives.map((drive) => drive.actRetryMinutes)).toStrictEqual([5]);
});
