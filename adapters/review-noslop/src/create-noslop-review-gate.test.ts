import { expect, test } from 'bun:test';
import type { GateRound, JsonValue } from '@boxxy/model';
import { brandSchemas, toJSONValue } from '@boxxy/model';
import { createNoslopReviewGate } from './create-noslop-review-gate.ts';
import { buildMockReviewResult } from './test-utils/build-mock-review-result.ts';
import { createFakeNoslopClient } from './test-utils/create-fake-noslop-client.ts';

function setupTest() {
  const round: GateRound = {
    attempt: brandSchemas.attemptId.parse('01890a5d-ac96-774b-bcce-b302099a8057'),
    pullRequest: { repo: brandSchemas.repoName.parse('example/app'), number: 7 },
    round: 2,
    cause: 'rework',
  };

  return {
    round,
    createGate: (client: ReturnType<typeof createFakeNoslopClient>) =>
      createNoslopReviewGate({ appEnv: { NOSLOP_GITHUB_APP_ID: '1' }, client }),

    // unknown, so a test compares the reading with plain strings
    accept: (
      client: ReturnType<typeof createFakeNoslopClient>,
      body: JsonValue,
    ): Promise<unknown> =>
      createNoslopReviewGate({ appEnv: { NOSLOP_GITHUB_APP_ID: '1' }, client }).accept(round, body),
    buildBody: (review: unknown, exitCode = 0) =>
      toJSONValue({
        head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
        review,
        findings: { exitCode, list: { findings: [] } },
      }),
  };
}

test('it posts a result for the head and reads it as passed when check finds nothing open', async () => {
  const ctx = setupTest();

  const client = createFakeNoslopClient({
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
    outcome: { conclusion: 'success', title: 'No open findings', summary: '', open: [] },
  });

  const review = buildMockReviewResult({
    owner: 'example',
    repo: 'app',
    number: 7,
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
  });

  const reading = await ctx.accept(client, ctx.buildBody(review));

  expect([reading, client.posted]).toStrictEqual([
    {
      status: 'passed',
      head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
      open: { high: 0, medium: 0, low: 0 },
      closedWithoutFix: 0,
      findingPaths: [],
      cost: {
        calls: [
          {
            model: 'claude-test-model',
            input: 1200,
            cachedInput: 300,
            cacheWrite: 40,
            output: 210,
            durationMs: 4100,
          },
        ],
      },
      ref: review.reviewID,
      answerHint:
        'Run `noslop findings --pr 7 --repo example/app --json`, and reply to each open finding with a disposition: fixed, not-a-defect, deferred or accepted-risk.',
    },
    [review],
  ]);
});

test('it reads a fixes-only result that judged no fix as not covered, and posts nothing', async () => {
  const ctx = setupTest();

  const client = createFakeNoslopClient({
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
    outcome: { conclusion: 'success', title: '', summary: '', open: [] },
  });

  const review = buildMockReviewResult({
    owner: 'example',
    repo: 'app',
    number: 7,
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
    fixesOnly: { fixChecks: [] },
  });

  const reading = await ctx.accept(client, ctx.buildBody(review));

  expect([reading, client.posted, client.checked]).toStrictEqual([
    {
      status: 'not-covered',
      head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
      cost: expect.any(Object),
    },
    [],
    0,
  ]);
});

test('it reads a result for an old head as not covered, because noslop refuses to post it', async () => {
  const ctx = setupTest();

  const client = createFakeNoslopClient({
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
    outcome: { conclusion: 'success', title: '', summary: '', open: [] },
  });

  const review = buildMockReviewResult({
    owner: 'example',
    repo: 'app',
    number: 7,
    head: '1111111111111111111111111111111111111111',
  });

  const reading = await ctx.accept(client, ctx.buildBody(review));

  expect([reading, client.posted, client.checked]).toStrictEqual([
    {
      status: 'not-covered',
      head: '1111111111111111111111111111111111111111',
      cost: expect.any(Object),
    },
    [],
    0,
  ]);
});

test('it reads a check failure with no open finding as blocked unreadable', async () => {
  const ctx = setupTest();

  const client = createFakeNoslopClient({
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
    outcome: {
      conclusion: 'failure',
      title: 'A finding marker is unreadable',
      summary: '',
      open: [],
    },
  });

  const review = buildMockReviewResult({
    owner: 'example',
    repo: 'app',
    number: 7,
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
  });

  const reading = await ctx.accept(client, ctx.buildBody(review));

  expect(reading).toStrictEqual(expect.objectContaining({ status: 'blocked', why: 'unreadable' }));
});

test('it reads a result for another pull request as not covered, and posts nothing', async () => {
  const ctx = setupTest();

  const client = createFakeNoslopClient({
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
    outcome: { conclusion: 'success', title: '', summary: '', open: [] },
  });

  const review = buildMockReviewResult({
    owner: 'example',
    repo: 'app',
    number: 8,
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
  });

  const reading = await ctx.accept(client, ctx.buildBody(review));

  expect([reading, client.posted]).toStrictEqual([
    expect.objectContaining({ status: 'not-covered' }),
    [],
  ]);
});

test('it reads a body with no review as not covered at the checkout head, and posts nothing', async () => {
  const ctx = setupTest();

  const client = createFakeNoslopClient({
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
    outcome: { conclusion: 'success', title: '', summary: '', open: [] },
  });

  const reading = await ctx.accept(client, ctx.buildBody(null, 1));

  expect([reading, client.posted]).toStrictEqual([
    {
      status: 'not-covered',
      head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
      cost: { calls: [] },
    },
    [],
  ]);
});

test('it throws when GitHub gives no answer, so the session sends again', () => {
  const ctx = setupTest();

  const client = createFakeNoslopClient({
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
    outcome: { conclusion: 'success', title: '', summary: '', open: [] },
    down: true,
  });

  const review = buildMockReviewResult({
    owner: 'example',
    repo: 'app',
    number: 7,
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
  });

  const accepted = ctx.accept(client, ctx.buildBody(review));

  expect(accepted).rejects.toThrowWithMessage(Error, /fetch failed/u);
});

test('it builds the review command for the round', () => {
  const ctx = setupTest();

  const client = createFakeNoslopClient({
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
    outcome: { conclusion: 'success', title: '', summary: '', open: [] },
  });

  const command = ctx.createGate(client).buildCommand(ctx.round);

  expect(command).toStartWith("bun -e '");
});
