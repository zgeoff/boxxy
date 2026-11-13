import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { HttpResponse, http } from 'msw';
import { createGithubClient } from '../create-github-client.ts';
import { GithubForgeError } from '../github-forge-error.ts';
import mergeAnswers from '../test-utils/fixtures/merge-answers.json' with { type: 'json' };
import { GITHUB_API_URL, githubPullRequests } from '../test-utils/github-handlers.ts';
import { mockNetwork } from '../test-utils/mock-network.ts';
import { mergeAtHead } from './merge-at-head.ts';

function setupTest() {
  const client = createGithubClient({
    fetch: globalThis.fetch,
    baseUrl: GITHUB_API_URL,
    token: 'token-for-tests',
  });

  const repo = brandSchemas.repoName.parse('acme/lamps');

  return {
    client,
    ref: { repo, number: 7 },
    head: brandSchemas.commitSha.parse('7a1c'.padEnd(40, '0')),
    mergeURL: `${GITHUB_API_URL}/repos/acme/lamps/pulls/7/merge`,
  };
}

test('it sends one PUT with the head as `sha`, the method, a JSON body and the token', async () => {
  const ctx = setupTest();
  const sent: unknown[] = [];

  mockNetwork.use(
    http.put(ctx.mergeURL, async (info) => {
      sent.push([
        info.request.headers.get('content-type'),
        info.request.headers.get('authorization'),
        await info.request.json(),
      ]);

      return HttpResponse.json(mergeAnswers.merged);
    }),
  );

  await mergeAtHead(ctx.client, ctx.ref, ctx.head, 'squash');

  expect(sent).toStrictEqual([
    ['application/json', 'Bearer token-for-tests', { sha: ctx.head, merge_method: 'squash' }],
  ]);
});

test('it answers merged with the merge commit that GitHub gives', () => {
  const ctx = setupTest();

  mockNetwork.use(http.put(ctx.mergeURL, () => HttpResponse.json(mergeAnswers.merged)));

  expect(mergeAtHead(ctx.client, ctx.ref, ctx.head, 'merge')).resolves.toStrictEqual({
    kind: 'merged',
    mergeCommit: brandSchemas.commitSha.parse('c0ffee0000000000000000000000000000000007'),
  });
});

test('it answers head-moved to a 409', () => {
  const ctx = setupTest();

  mockNetwork.use(
    http.put(ctx.mergeURL, () => HttpResponse.json(mergeAnswers.headMoved, { status: 409 })),
  );

  expect(mergeAtHead(ctx.client, ctx.ref, ctx.head, 'merge')).resolves.toStrictEqual({
    kind: 'head-moved',
  });
});

test('it answers not-mergeable with the GitHub message as the reason for a pull request that conflicts', async () => {
  const ctx = setupTest();

  await githubPullRequests.create({
    repo: 'acme/lamps',
    number: 7,
    mergeable: false,
    commits: [{ sha: ctx.head, message: 'Fix the lamp' }],
  });

  const answer = await mergeAtHead(ctx.client, ctx.ref, ctx.head, 'rebase');

  expect(answer).toStrictEqual({ kind: 'not-mergeable', reason: 'Pull Request is not mergeable' });
});

test('it throws an error that names the status for a 422', () => {
  const ctx = setupTest();

  mockNetwork.use(
    http.put(ctx.mergeURL, () => HttpResponse.json(mergeAnswers.invalidMethod, { status: 422 })),
  );

  expect(mergeAtHead(ctx.client, ctx.ref, ctx.head, 'merge')).rejects.toThrowWithMessage(
    GithubForgeError,
    'GitHub answered 422 to PUT /repos/acme/lamps/pulls/7/merge',
  );
});

test('it throws for a 200 that does not say the pull request merged', () => {
  const ctx = setupTest();

  mockNetwork.use(
    http.put(ctx.mergeURL, () => HttpResponse.json({ ...mergeAnswers.merged, merged: false })),
  );

  expect(mergeAtHead(ctx.client, ctx.ref, ctx.head, 'merge')).rejects.toThrow(/unknown body/u);
});
