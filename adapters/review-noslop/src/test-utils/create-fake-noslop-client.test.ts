import { expect, test } from 'bun:test';
import { buildMockReviewResult } from './build-mock-review-result.ts';
import { createFakeNoslopClient } from './create-fake-noslop-client.ts';

test('it posts a result for the head and answers check with the outcome', async () => {
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

  await client.sendResult(review, { env: {}, verify: true });

  const outcome = await client.check(
    { owner: 'example', repo: 'app', number: 7 },
    { env: {}, readOnly: true },
  );

  expect([client.posted, client.checked, outcome]).toStrictEqual([
    [review],
    1,
    { conclusion: 'success', title: 'No open findings', summary: '', open: [] },
  ]);
});

test('it refuses a result for another head with the error noslop throws', () => {
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

  const sent = client.sendResult(review, { env: {}, verify: true });

  expect(sent).rejects.toMatchObject({
    cause: { message: expect.stringMatching(/^the result does not verify/u) },
  });
});

test('it fails a check with a network failure when GitHub is down', () => {
  const client = createFakeNoslopClient({
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
    outcome: { conclusion: 'success', title: '', summary: '', open: [] },
    down: true,
  });

  const checked = client.check(
    { owner: 'example', repo: 'app', number: 7 },
    { env: {}, readOnly: true },
  );

  expect(checked).rejects.toThrowWithMessage(Error, /fetch failed/u);
});
