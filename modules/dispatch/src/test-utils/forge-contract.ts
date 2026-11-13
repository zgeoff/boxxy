import type { CommitSha, Forge, PullRequestRef } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import type {
  SeededCompare,
  SeededMergeable,
  SeededPullRequest,
  SeededRequiredChecks,
} from './create-fake-forge.ts';

// What a forge adapter's test gives each case: the forge, and a way to put state on the service
// behind it. A seed may be async, as a mock service's store is.
export interface ForgeHarness {
  readonly forge: Forge;
  seed: (pullRequest: SeededPullRequest) => void | Promise<void>;
  seedCompare: (compare: SeededCompare) => void | Promise<void>;
  seedRequiredChecks: (required: SeededRequiredChecks) => void | Promise<void>;
  seedMergeable: (mergeable: SeededMergeable) => void | Promise<void>;
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
      await harness.seed(buildOpen(7, 2));

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

      await harness.seed({
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

      await harness.seed({ ...open, reading: { ...open.reading, state: 'closed' } });

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
      await harness.seed(buildOpen(10, 130));

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

      await harness.seed(buildOpen(3));
      await harness.seed(buildOpen(1));
      await harness.seed({ ...merged, reading: { ...merged.reading, state: 'closed' } });
      await harness.seed(buildOpen(1, 0, otherRepo));

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
        await harness.seed(buildOpen(number));
      }

      const listed = await harness.forge.listOpenPullRequests(repo);

      return {
        received: listed.map((ref) => ref.number),
        expected: Array.from({ length: 105 }, (_unused, index) => index + 1),
      };
    },
  ],
  [
    '#readChangedFiles reads each changed file of the compare of two heads with its changed lines',
    async (harness) => {
      const files = [
        { path: 'src/lamp.ts', changedLines: 12 },
        { path: 'docs/lamp.md', changedLines: 3 },
      ];

      await harness.seedCompare({ repo, from: buildSha(1), to: buildSha(2), files });

      return {
        received: await harness.forge.readChangedFiles(repo, buildSha(1), buildSha(2)),
        expected: files,
      };
    },
  ],
  [
    '#readRequiredChecks reads the checks that the branch requires',
    async (harness) => {
      await harness.seedRequiredChecks({
        repo,
        branch: 'main',
        checks: ['build', 'verify / gate'],
      });

      return {
        received: await harness.forge.readRequiredChecks(repo, 'main'),
        expected: ['build', 'verify / gate'],
      };
    },
  ],
  [
    '#readRequiredChecks reads no checks for a branch with a slash in its name that requires none',
    async (harness) => {
      await harness.seedRequiredChecks({ repo, branch: 'release/2', checks: [] });

      return { received: await harness.forge.readRequiredChecks(repo, 'release/2'), expected: [] };
    },
  ],
  [
    '#readRequiredChecks rejects for a branch that does not exist',
    async (harness) => ({
      received: await toSettled(harness.forge.readRequiredChecks(repo, 'gone')),
      expected: 'rejected',
    }),
  ],
  [
    '#readMergeable reads a pull request with no conflict as clean',
    async (harness) => {
      await harness.seed(buildOpen(11, 1));
      await harness.seedMergeable({ ref: buildRef(11), mergeable: 'clean' });

      return { received: await harness.forge.readMergeable(buildRef(11)), expected: 'clean' };
    },
  ],
  [
    '#readMergeable reads a pull request that conflicts with its base as conflict',
    async (harness) => {
      await harness.seed(buildOpen(12, 1));
      await harness.seedMergeable({ ref: buildRef(12), mergeable: 'conflict' });

      return { received: await harness.forge.readMergeable(buildRef(12)), expected: 'conflict' };
    },
  ],
  [
    '#readMergeable reads a pull request whose merge the forge has not worked out as unknown',
    async (harness) => {
      await harness.seed(buildOpen(13, 1));
      await harness.seedMergeable({ ref: buildRef(13), mergeable: 'unknown' });

      return { received: await harness.forge.readMergeable(buildRef(13)), expected: 'unknown' };
    },
  ],
  [
    '#readMergeable reads a merged pull request as unknown',
    async (harness) => {
      await harness.seed(buildOpen(18, 1));
      await harness.forge.mergeAtHead(buildRef(18), buildSha(1), 'squash');

      return { received: await harness.forge.readMergeable(buildRef(18)), expected: 'unknown' };
    },
  ],
  [
    '#readMergeable rejects for a pull request that does not exist',
    async (harness) => ({
      received: await toSettled(harness.forge.readMergeable(buildRef(404))),
      expected: 'rejected',
    }),
  ],
  [
    '#mergeAtHead merges a clean pull request at its head, which then reads merged at that commit',
    async (harness) => {
      await harness.seed(buildOpen(14, 2));

      const answer = await harness.forge.mergeAtHead(buildRef(14), buildSha(2), 'squash');
      const reading = await harness.forge.readPullRequest(buildRef(14));

      return {
        received: [
          answer.kind,
          reading === 'not-found' ? reading : [reading.state, reading.mergeCommit],
        ],
        expected: ['merged', ['merged', answer.kind === 'merged' ? answer.mergeCommit : null]],
      };
    },
  ],
  [
    '#mergeAtHead answers head-moved and merges nothing when the head is no longer the one given',
    async (harness) => {
      await harness.seed(buildOpen(15, 2));

      const answer = await harness.forge.mergeAtHead(buildRef(15), buildSha(1), 'merge');
      const reading = await harness.forge.readPullRequest(buildRef(15));

      return {
        received: [answer, reading === 'not-found' ? reading : reading.state],
        expected: [{ kind: 'head-moved' }, 'open'],
      };
    },
  ],
  [
    '#mergeAtHead answers not-mergeable for a pull request that conflicts with its base',
    async (harness) => {
      await harness.seed(buildOpen(16, 1));
      await harness.seedMergeable({ ref: buildRef(16), mergeable: 'conflict' });

      const answer = await harness.forge.mergeAtHead(buildRef(16), buildSha(1), 'rebase');

      return { received: answer.kind, expected: 'not-mergeable' };
    },
  ],
  [
    '#mergeAtHead answers not-mergeable for a pull request closed with no merge',
    async (harness) => {
      const open = buildOpen(17, 1);

      await harness.seed({ ...open, reading: { ...open.reading, state: 'closed' } });

      const answer = await harness.forge.mergeAtHead(buildRef(17), buildSha(1), 'squash');

      return { received: answer.kind, expected: 'not-mergeable' };
    },
  ],
  [
    '#mergeAtHead rejects for a pull request that does not exist',
    async (harness) => ({
      received: await toSettled(harness.forge.mergeAtHead(buildRef(404), buildSha(1), 'squash')),
      expected: 'rejected',
    }),
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

function buildSha(index: number): CommitSha {
  return brandSchemas.commitSha.parse(index.toString(16).padStart(40, '0'));
}

function toSettled(promise: Promise<unknown>): Promise<'resolved' | 'rejected'> {
  return promise.then(
    () => 'resolved',
    () => 'rejected',
  );
}
