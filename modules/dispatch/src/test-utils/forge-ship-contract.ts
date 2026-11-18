import type { CommitSha, Release } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import type { ForgeContractCase } from './forge-contract.ts';

const repo = brandSchemas.repoName.parse('acme/lamps');
const otherRepo = brandSchemas.repoName.parse('acme/shades');

// The behaviour of the forge port's reads that the ship watch relies on. Every adapter and the
// fake pass it, beside the forge contract.
export const forgeShipContract: readonly ForgeContractCase[] = [
  [
    '#readRepo reads a repo that the forge holds as readable',
    async (harness) => {
      await harness.seedRepo({ repo });

      return { received: await harness.forge.readRepo(repo), expected: 'readable' };
    },
  ],
  [
    '#readRepo answers not-found for a repo that the forge does not hold',
    async (harness) => ({
      received: await harness.forge.readRepo(otherRepo),
      expected: 'not-found',
    }),
  ],
  [
    '#readTag reads the commit of a tag, with a slash in its name',
    async (harness) => {
      await harness.seedTag({ repo, tag: 'deployed/prod', commit: buildSha(5) });

      return {
        received: await harness.forge.readTag(repo, 'deployed/prod'),
        expected: buildSha(5),
      };
    },
  ],
  [
    '#readTag answers null for a tag that does not exist',
    async (harness) => {
      await harness.seedRepo({ repo });

      return { received: await harness.forge.readTag(repo, 'deployed/prod'), expected: null };
    },
  ],
  [
    '#contains is true when the history of the ref holds the commit',
    async (harness) => {
      await harness.seedHistory({ repo, ref: buildSha(9), commits: [buildSha(1), buildSha(2)] });

      return {
        received: await harness.forge.contains(repo, buildSha(9), buildSha(2)),
        expected: true,
      };
    },
  ],
  [
    '#contains is false when the history of the ref lacks the commit',
    async (harness) => {
      await harness.seedHistory({ repo, ref: buildSha(9), commits: [buildSha(1)] });

      return {
        received: await harness.forge.contains(repo, buildSha(9), buildSha(2)),
        expected: false,
      };
    },
  ],
  [
    '#contains is false for a ref that the repo does not hold',
    async (harness) => ({
      received: await harness.forge.contains(repo, buildSha(8), buildSha(2)),
      expected: false,
    }),
  ],
  [
    '#listReleases lists the published releases newest first, and none of a draft',
    async (harness) => {
      await harness.seedReleases({
        repo,
        releases: [
          buildRelease('v1.0.0', 1000),
          { ...buildRelease('v1.2.0-rc.1', 3000), prerelease: true },
          { ...buildRelease('v1.3.0', 0), draft: true, publishedAt: null },
          buildRelease('v1.1.0', 2000),
        ],
      });

      const releases = await harness.forge.listReleases(repo);

      return {
        received: releases.map((release) => [release.tag, release.prerelease]),
        expected: [
          ['v1.2.0-rc.1', true],
          ['v1.1.0', false],
          ['v1.0.0', false],
        ],
      };
    },
  ],
  [
    '#listReleases gives the release URL and publish time',
    async (harness) => {
      await harness.seedReleases({ repo, releases: [buildRelease('v2.0.0', 5000)] });

      return {
        received: await harness.forge.listReleases(repo),
        expected: [buildRelease('v2.0.0', 5000)],
      };
    },
  ],
  [
    '#listReleases lists at most the 100 newest releases',
    async (harness) => {
      await harness.seedReleases({
        repo,
        releases: Array.from({ length: 105 }, (_unused, index) =>
          buildRelease(`v0.0.${index}`, (index + 1) * 1000),
        ),
      });

      const releases = await harness.forge.listReleases(repo);

      return {
        received: [releases.length, releases.at(0)?.tag, releases.at(-1)?.tag],
        expected: [100, 'v0.0.104', 'v0.0.5'],
      };
    },
  ],
  [
    '#findBumps lists the Bot pull requests merged at or after the time, oldest merge first',
    async (harness) => {
      await harness.seedBumps({
        repo,
        bumps: [
          buildBump(3, 3000, 'Bot'),
          buildBump(1, 1000, 'Bot'),
          buildBump(2, 2000, 'User'),
          buildBump(4, 2000, 'Bot'),
        ],
      });

      const bumps = await harness.forge.findBumps(repo, brandSchemas.instant.parse(2000));

      return {
        received: bumps.map((bump) => bump.number),
        expected: [4, 3],
      };
    },
  ],
  [
    '#findBumps gives the body, merge commit and merge time of a bump',
    async (harness) => {
      await harness.seedBumps({ repo, bumps: [buildBump(7, 4000, 'Bot')] });

      return {
        received: await harness.forge.findBumps(repo, brandSchemas.instant.parse(0)),
        expected: [
          {
            number: 7,
            body: 'Bump lamps to https://github.com/acme/lamps/releases/tag/v7',
            mergeCommit: buildSha(7),
            mergedAt: 4000,
          },
        ],
      };
    },
  ],
  [
    '#findBumps reads a deploy repo with more than 100 closed pull requests',
    async (harness) => {
      await harness.seedBumps({
        repo,
        bumps: Array.from({ length: 130 }, (_unused, index) =>
          buildBump(index + 1, (index + 1) * 1000, 'Bot'),
        ),
      });

      const bumps = await harness.forge.findBumps(repo, brandSchemas.instant.parse(1000));

      return { received: bumps.length, expected: 130 };
    },
  ],
];

function buildSha(index: number): CommitSha {
  return brandSchemas.commitSha.parse(index.toString(16).padStart(40, '0'));
}

function buildRelease(tag: string, publishedAt: number): Release {
  return {
    tag,
    url: `https://github.com/acme/lamps/releases/tag/${tag}`,
    draft: false,
    prerelease: false,
    publishedAt: brandSchemas.instant.parse(publishedAt),
  };
}

function buildBump(number: number, mergedAt: number, author: 'Bot' | 'User') {
  return {
    number,
    body: `Bump lamps to https://github.com/acme/lamps/releases/tag/v${number}`,
    mergeCommit: buildSha(number),
    mergedAt: brandSchemas.instant.parse(mergedAt),
    author,
  };
}
