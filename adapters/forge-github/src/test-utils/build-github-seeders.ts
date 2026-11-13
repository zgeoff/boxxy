import type { ForgeHarness } from '@boxxy/dispatch/test-utils/forge-contract';
import { githubBranches, githubCompares, githubPullRequests } from './github-handlers.ts';

type GithubSeeders = Omit<ForgeHarness, 'forge'>;

const mergeableFields = { clean: true, conflict: false, unknown: null } as const;

// Seeds the forge contract's state on the mock GitHub, as the GitHub REST API holds it.
export function buildGithubSeeders(): GithubSeeders {
  return {
    seed: async (pullRequest) => {
      const reading = pullRequest.reading;

      await githubPullRequests.create({
        repo: pullRequest.ref.repo,
        number: pullRequest.ref.number,
        id: pullRequest.githubId,
        body: pullRequest.body ?? null,
        state: reading.state === 'open' ? 'open' : 'closed',
        ...(reading.base !== undefined && { base: reading.base }),
        mergedAt: reading.mergedAt === null ? null : new Date(reading.mergedAt).toISOString(),
        mergeCommit: reading.mergeCommit,
        commits: reading.commits.map((row) => ({ sha: row.sha, message: row.message })),
      });
    },
    seedCompare: async (compare) => {
      await githubCompares.create({
        repo: compare.repo,
        from: compare.from,
        to: compare.to,
        files: compare.files.map((file) => ({ filename: file.path, changes: file.changedLines })),
      });
    },
    seedRequiredChecks: async (required) => {
      await githubBranches.create({
        repo: required.repo,
        name: required.branch,
        ruleChecks: [...required.checks],
      });
    },
    seedMergeable: async (seeded) => {
      await githubPullRequests.update(
        (query) => query.where({ repo: seeded.ref.repo, number: seeded.ref.number }),
        {
          data: (row) => {
            row.mergeable = mergeableFields[seeded.mergeable];
          },
        },
      );
    },
  };
}
