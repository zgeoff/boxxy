import { expect, test } from 'bun:test';
import { brandSchemas, toJSONValue } from '@boxxy/model';
import { buildMockGateReading } from '@boxxy/model/test-utils/build-mock-gate-reading';
import { createFakeReviewGate } from './create-fake-review-gate.ts';

function setupTest() {
  return {
    gate: createFakeReviewGate(),
    round: {
      attempt: brandSchemas.attemptId.parse('0190a6f4-0000-7000-8000-000000000001'),
      pullRequest: { repo: brandSchemas.repoName.parse('example/app'), number: 7 },
      round: 1,
      cause: 'first' as const,
    },
  };
}

test('it answers with the reading that the session sent, and records the post', async () => {
  const ctx = setupTest();
  const reading = toJSONValue(buildMockGateReading({ status: 'passed' }));

  const answer: unknown = await ctx.gate.accept(ctx.round, reading);

  expect(answer).toStrictEqual(reading);
  expect(ctx.gate.posted).toStrictEqual([{ round: ctx.round, result: reading }]);
});

test('it reads a result that is no reading as one that covers no head', async () => {
  const ctx = setupTest();

  const answer: unknown = await ctx.gate.accept(ctx.round, { review: 'text' });

  expect(answer).toStrictEqual({
    status: 'not-covered',
    head: '0000000000000000000000000000000000000000',
    cost: { calls: [] },
  });
});

test('it records the post of a held accept before it waits for the release', async () => {
  const ctx = setupTest();
  const hold = ctx.gate.holdAfterNextPost();
  const reading = toJSONValue(buildMockGateReading({ status: 'passed' }));
  const accepted = ctx.gate.accept(ctx.round, reading);

  await hold.entered;

  const postedWhileHeld = ctx.gate.posted.length;

  hold.release();

  await accepted;

  expect(postedWhileHeld).toBe(1);
});

test('it builds a command that names the pull request and the cause', () => {
  const ctx = setupTest();

  expect(ctx.gate.buildCommand(ctx.round)).toBe(
    'review-tool --pr 7 --repo example/app --cause first',
  );
});
