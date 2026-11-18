import type { ForgeHarness } from '@boxxy/dispatch/test-utils/forge-contract';
import {
  githubBranches,
  githubCompares,
  githubHistories,
  githubPullRequests,
  githubReleases,
  githubRepos,
  githubTags,
} from './github-handlers.ts';

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
    seedRepo: async (seeded) => {
      await githubRepos.create({ repo: seeded.repo });
    },
    seedTag: async (seeded) => {
      await githubRepos.create({ repo: seeded.repo });
      await githubTags.create({ repo: seeded.repo, tag: seeded.tag, commit: seeded.commit });
    },
    seedHistory: async (seeded) => {
      await githubHistories.create({
        repo: seeded.repo,
        ref: seeded.ref,
        commits: [...seeded.commits],
      });
    },
    seedReleases: async (seeded) => {
      for (const release of seeded.releases) {
        await githubReleases.create({
          repo: seeded.repo,
          tag: release.tag,
          url: release.url,
          draft: release.draft,
          prerelease: release.prerelease,
          publishedAt:
            release.publishedAt === null ? null : new Date(release.publishedAt).toISOString(),
        });
      }
    },
    seedBumps: async (seeded) => {
      for (const bump of seeded.bumps) {
        await githubPullRequests.create({
          repo: seeded.repo,
          number: bump.number,
          body: bump.body,
          state: 'closed',
          mergedAt: new Date(bump.mergedAt).toISOString(),
          mergeCommit: bump.mergeCommit,
          authorType: bump.author,
        });
      }
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
