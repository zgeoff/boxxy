import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildGithubSeeders } from './build-github-seeders.ts';
import { GITHUB_API_URL } from './github-handlers.ts';

test('it seeds a merged pull request that GitHub answers as closed with its merge time', async () => {
  const seeders = buildGithubSeeders();
  const repo = brandSchemas.repoName.parse('acme/lamps');

  await seeders.seed({
    ref: { repo, number: 31 },
    githubId: 8_000_031,
    reading: {
      state: 'merged',
      mergedAt: brandSchemas.instant.parse(1_800_000_000_000),
      mergeCommit: brandSchemas.commitSha.parse('d'.repeat(40)),
      commits: [],
    },
  });

  const response = await fetch(`${GITHUB_API_URL}/repos/acme/lamps/pulls/31`);
  const body: unknown = await response.json();

  expect(body).toMatchObject({
    id: 8_000_031,
    state: 'closed',
    merged_at: '2027-01-15T08:00:00.000Z',
    merge_commit_sha: 'd'.repeat(40),
  });
});

test('it seeds a pull request whose merge GitHub has not worked out as mergeable null', async () => {
  const seeders = buildGithubSeeders();
  const repo = brandSchemas.repoName.parse('acme/lamps');

  await seeders.seed({
    ref: { repo, number: 32 },
    githubId: 8_000_032,
    reading: { state: 'open', mergedAt: null, mergeCommit: null, commits: [] },
  });

  await seeders.seedMergeable({ ref: { repo, number: 32 }, mergeable: 'unknown' });

  const response = await fetch(`${GITHUB_API_URL}/repos/acme/lamps/pulls/32`);
  const body: unknown = await response.json();

  expect(body).toMatchObject({ mergeable: null });
});
