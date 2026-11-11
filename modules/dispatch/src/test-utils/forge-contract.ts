import type { Forge, PullRequestRef } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import type { SeededPullRequest } from './create-fake-forge.ts';

// What a forge adapter's test gives each case: the forge, and a way to put a pull request on the
// service behind it.
export interface ForgeHarness {
  readonly forge: Forge;
  seed: (pullRequest: SeededPullRequest) => void;
}

export interface ForgeContractOutcome {
  readonly received: unknown;
  readonly expected: unknown;
}

export type ForgeContractCase = readonly [
  title: string,
  check: (harness: ForgeHarness) => Promise<ForgeContractOutcome>,
];

const repo = brandSchemas.repoName.parse('acme/lamps');
const otherRepo = brandSchemas.repoName.parse('acme/shades');

// The behaviour of the forge port that dispatch relies on. Every adapter and the fake pass it.
export const forgeContract: readonly ForgeContractCase[] = [
  [
    '#readPullRequest reads an open pull request with its GitHub id, url and commits',
    async (harness) => {
      harness.seed(buildOpen(7, 2));

      const reading = await harness.forge.readPullRequest(buildRef(7));

      return {
        received: reading,
        expected: {
          url: 'https://github.com/acme/lamps/pull/7',
          githubId: 5_000_007,
          state: 'open',
          mergedAt: null,
          mergeCommit: null,
          commits: [
            {
              sha: buildSha(1),
              message: 'Fix lamp 1\n\nBoxxy-Attempt: 0190a6f4-0000-7000-8000-000000000001',
            },
            {
              sha: buildSha(2),
              message: 'Fix lamp 2\n\nBoxxy-Attempt: 0190a6f4-0000-7000-8000-000000000001',
            },
          ],
        },
      };
    },
  ],
  [
    '#readPullRequest reads a merged pull request with its merge time and merge commit',
    async (harness) => {
      const mergedAt = brandSchemas.instant.parse(1_800_000_000_000);
      const open = buildOpen(8);

      harness.seed({
        ...open,
        reading: { ...open.reading, state: 'merged', mergedAt, mergeCommit: buildSha(99) },
      });

      const reading = await harness.forge.readPullRequest(buildRef(8));

      return {
        received:
          reading === 'not-found'
            ? reading
            : [reading.state, reading.mergedAt, reading.mergeCommit],
        expected: ['merged', mergedAt, buildSha(99)],
      };
    },
  ],
  [
    '#readPullRequest reads a pull request closed with no merge as closed',
    async (harness) => {
      const open = buildOpen(9);

      harness.seed({ ...open, reading: { ...open.reading, state: 'closed' } });

      const reading = await harness.forge.readPullRequest(buildRef(9));

      return {
        received:
          reading === 'not-found'
            ? reading
            : [reading.state, reading.mergedAt, reading.mergeCommit],
        expected: ['closed', null, null],
      };
    },
  ],
  [
    '#readPullRequest reads every commit of a pull request over one page',
    async (harness) => {
      harness.seed(buildOpen(10, 130));

      const reading = await harness.forge.readPullRequest(buildRef(10));

      return {
        received: reading === 'not-found' ? reading : reading.commits.map((commit) => commit.sha),
        expected: Array.from({ length: 130 }, (_unused, index) => buildSha(index + 1)),
      };
    },
  ],
  [
    '#readPullRequest answers not-found for a pull request that does not exist',
    async (harness) => ({
      received: await harness.forge.readPullRequest(buildRef(404)),
      expected: 'not-found',
    }),
  ],
  [
    '#listOpenPullRequests lists the open pull requests of the repo, lowest number first',
    async (harness) => {
      const merged = buildOpen(2);

      harness.seed(buildOpen(3));
      harness.seed(buildOpen(1));
      harness.seed({ ...merged, reading: { ...merged.reading, state: 'closed' } });
      harness.seed(buildOpen(1, 0, otherRepo));

      return {
        received: await harness.forge.listOpenPullRequests(repo),
        expected: [buildRef(1), buildRef(3)],
      };
    },
  ],
  [
    '#listOpenPullRequests lists every open pull request over one page',
    async (harness) => {
      for (let number = 1; number <= 105; number += 1) {
        harness.seed(buildOpen(number));
      }

      const listed = await harness.forge.listOpenPullRequests(repo);

      return {
        received: listed.map((ref) => ref.number),
        expected: Array.from({ length: 105 }, (_unused, index) => index + 1),
      };
    },
  ],
];

function buildOpen(number: number, commitCount = 0, inRepo = repo): SeededPullRequest {
  return {
    ref: buildRef(number, inRepo),
    githubId: 5_000_000 + number,
    reading: {
      state: 'open',
      mergedAt: null,
      mergeCommit: null,
      commits: Array.from({ length: commitCount }, (_unused, index) => ({
        sha: buildSha(index + 1),
        message: `Fix lamp ${index + 1}\n\nBoxxy-Attempt: 0190a6f4-0000-7000-8000-000000000001`,
      })),
    },
  };
}

function buildRef(number: number, inRepo = repo): PullRequestRef {
  return { repo: inRepo, number };
}

function buildSha(index: number): ReturnType<typeof brandSchemas.commitSha.parse> {
  return brandSchemas.commitSha.parse(index.toString(16).padStart(40, '0'));
}
