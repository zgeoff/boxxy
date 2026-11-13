import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { createFakeVerifier } from './create-fake-verifier.ts';

test('it reads verified at the head it is asked about until the test sets a status', () => {
  const verifier = createFakeVerifier();
  const pullRequest = { repo: brandSchemas.repoName.parse('acme/lamps'), number: 7 };
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');

  expect(verifier.readAt(pullRequest, head)).resolves.toStrictEqual({
    status: 'verified',
    head,
    features: [],
  });
});

test('it reads not-covered with no features once the test sets that status', () => {
  const verifier = createFakeVerifier();
  const pullRequest = { repo: brandSchemas.repoName.parse('acme/lamps'), number: 7 };
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');

  verifier.setStatus('not-covered');

  expect(verifier.readAt(pullRequest, head)).resolves.toStrictEqual({
    status: 'not-covered',
    head,
  });
});

test('it lists each read with its pull request and head', async () => {
  const verifier = createFakeVerifier();
  const pullRequest = { repo: brandSchemas.repoName.parse('acme/lamps'), number: 7 };
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');

  await verifier.readAt(pullRequest, head);

  expect(verifier.reads).toStrictEqual([{ pullRequest, head }]);
});
