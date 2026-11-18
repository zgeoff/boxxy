import { expect, test } from 'bun:test';
import type { CommitSha, ItemId, Release } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockPauseChange } from '../test-utils/build-mock-pause-change.ts';
import type { SeededBumps } from '../test-utils/create-fake-forge.ts';
import { createFakeForge } from '../test-utils/create-fake-forge.ts';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { loadShipRules } from '../test-utils/load-ship-rules.ts';
import { seedMergedItem, seededMergeCommit } from '../test-utils/seed-merged-item.ts';
import { watchShips } from './watch-ships.ts';

type Bump = SeededBumps['bumps'][number];

interface ReleaseSeed {
  readonly tag: string;
  readonly publishedAt: number;
  readonly isContaining: boolean;
  readonly prerelease?: boolean;
}

type RuleName = 'deployTag' | 'release' | 'prerelease' | 'releaseThenDeploy' | 'none';

async function setupTest(ruleName: RuleName) {
  const ruleLines: Record<RuleName, string> = {
    deployTag: '  example/app: { ships: { deploy-tag: { tag: deployed/prod } } }',
    release: '  example/app: { ships: { release: {} } }',
    prerelease: '  example/app: { ships: { release: { prerelease: true } } }',
    releaseThenDeploy:
      '  example/app: { ships: { release: {}, then: { repo: example/deploy, tag: deployed/prod/app } } }',
    none: '  example/other: { ships: none }',
  };

  const repos = [ruleLines[ruleName]];

  const dispatch = await createTestDispatch();

  const forge = createFakeForge();
  const warnings: string[] = [];
  const app = brandSchemas.repoName.parse('example/app');
  const deploy = brandSchemas.repoName.parse('example/deploy');

  dispatch.setRules(loadShipRules({ repos }));

  const shaWidth = 40;

  const buildSha = (index: number): CommitSha =>
    brandSchemas.commitSha.parse(index.toString(16).padStart(shaWidth, 'f'));

  const watchWith = (spawnRepos: ReadonlySet<typeof app>) =>
    watchShips({
      forge,
      store: dispatch.store,
      rules: dispatch.rules(),
      runner: dispatch.runner,
      now: dispatch.clock.now(),
      newId: dispatch.newId,
      spawnRepos,
      warn: (message, detail) => {
        warnings.push(`${message} ${JSON.stringify(detail)}`);
      },
    });

  return {
    ...dispatch,
    forge,
    warnings,
    app,
    buildSha,
    twoReleases: [
      { tag: 'v2.0.0', publishedAt: 2000, isContaining: true },
      { tag: 'v1.0.0', publishedAt: 1000, isContaining: true },
    ] satisfies readonly ReleaseSeed[],
    mergeCommit: seededMergeCommit,
    mergeItem: (options?: Parameters<typeof seedMergedItem>[3]) =>
      seedMergedItem(dispatch, forge, ['prod'], options),
    watch: () => watchWith(new Set([app])),
    watchWithNoRepos: () => watchWith(new Set()),
    readShipped: (item: ItemId) => dispatch.store.read((tx) => tx.listShipped(item)),
    readState: async (item: ItemId) => {
      const view = await dispatch.store.read((tx) =>
        tx.readItem(item, dispatch.clock.now(), dispatch.rules()),
      );

      return view?.derived;
    },
    listShippedFacts: () => dispatch.listFacts('boxxy.item.shipped'),
    listShippedFactRows: async () => {
      const facts = await dispatch.listFacts('boxxy.item.shipped');

      return facts.map((fact) => [fact.entity, fact.actor, fact.payload]);
    },

    // a repo with a tag on a commit whose history holds the given commits
    putTag: (tag: string, commit: CommitSha, holds: readonly CommitSha[]) => {
      forge.seedRepo({ repo: app });
      forge.seedTag({ repo: app, tag, commit });
      forge.seedHistory({ repo: app, ref: commit, commits: holds });
    },

    // the releases of the app repo, each with a tag whose history holds the merge commit or not
    putReleases: (releases: readonly ReleaseSeed[]) => {
      const published: Release[] = releases.map((each) => ({
        tag: each.tag,
        url: `https://github.com/example/app/releases/tag/${each.tag}`,
        draft: false,
        prerelease: each.prerelease === true,
        publishedAt: brandSchemas.instant.parse(each.publishedAt),
      }));

      forge.seedRepo({ repo: app });
      forge.seedReleases({ repo: app, releases: published });

      for (const each of releases) {
        const commit = buildSha(100 + each.publishedAt);

        forge.seedTag({ repo: app, tag: each.tag, commit });

        forge.seedHistory({
          repo: app,
          ref: commit,
          commits: each.isContaining ? [seededMergeCommit] : [],
        });
      }
    },

    // the deploy repo with these bump pull requests, and a deploy tag whose history holds `holds`
    putDeploy: (bumps: readonly Bump[], holds: readonly CommitSha[]) => {
      forge.seedRepo({ repo: deploy });
      forge.seedBumps({ repo: deploy, bumps });
      forge.seedTag({ repo: deploy, tag: 'deployed/prod/app', commit: buildSha(500) });
      forge.seedHistory({ repo: deploy, ref: buildSha(500), commits: holds });
    },
    buildBump: (number: number, mergedAt: number, body: string, author: Bump['author']): Bump => ({
      number,
      body,
      mergeCommit: buildSha(number),
      mergedAt: brandSchemas.instant.parse(mergedAt),
      author,
    }),
  };
}

test('it ships an item when the deploy tag holds its merge commit, with the row and the fact in one change', async () => {
  const ctx = await setupTest('deployTag');
  const item = await ctx.mergeItem();

  const seenAt = ctx.clock.now();

  ctx.putTag('deployed/prod', ctx.buildSha(9), [ctx.mergeCommit]);

  const shipped: unknown = await ctx.watch();
  const facts = await ctx.listShippedFactRows();
  const stored: unknown = await ctx.readShipped(item);
  const state = await ctx.readState(item);

  const row = {
    itemId: item,
    commit: ctx.mergeCommit,
    rule: 'deploy-tag',
    ref: 'deployed/prod',
    seenAt,
  };

  expect(shipped).toStrictEqual([row]);
  expect(stored).toStrictEqual([row]);
  expect(facts).toStrictEqual([[`boxxy:item:${item}`, 'boxxy:runner:runner-1', row]]);
  expect(state).toStrictEqual({ state: 'ready' });
});

test('it writes nothing for a deploy tag whose history lacks the commit', async () => {
  const ctx = await setupTest('deployTag');
  const item = await ctx.mergeItem();

  ctx.putTag('deployed/prod', ctx.buildSha(9), [ctx.buildSha(1)]);

  const shipped = await ctx.watch();
  const rows = await ctx.readShipped(item);
  const state = await ctx.readState(item);

  expect([shipped, rows]).toStrictEqual([[], []]);
  expect(state).toStrictEqual({ state: 'waiting', reason: 'wait:shipped' });
});

test('it writes nothing for a deploy tag that does not exist', async () => {
  const ctx = await setupTest('deployTag');
  const item = await ctx.mergeItem();

  ctx.forge.seedRepo({ repo: ctx.app });

  const shipped = await ctx.watch();
  const rows = await ctx.readShipped(item);

  expect([shipped, rows]).toStrictEqual([[], []]);
});

test('it ships with the oldest release that holds the merge commit, reading newest first', async () => {
  const ctx = await setupTest('release');
  const item = await ctx.mergeItem();

  ctx.putReleases([
    { tag: 'v3.0.0', publishedAt: 3000, isContaining: true },
    { tag: 'v2.0.0', publishedAt: 2000, isContaining: true },
    { tag: 'v1.0.0', publishedAt: 1000, isContaining: false },
  ]);

  const shipped = await ctx.watch();

  const received: unknown = shipped.map((row) => [row.itemId, row.rule, row.ref]);

  expect(received).toStrictEqual([[item, 'release', 'v2.0.0']]);
});

test('it stops at the first release that lacks the merge commit', async () => {
  const ctx = await setupTest('release');

  await ctx.mergeItem();

  ctx.putReleases([
    { tag: 'v3.0.0', publishedAt: 3000, isContaining: false },
    { tag: 'v2.0.0', publishedAt: 2000, isContaining: true },
  ]);

  const shipped = await ctx.watch();

  expect(shipped).toStrictEqual([]);
});

test('it skips a prerelease unless the rule allows prereleases', async () => {
  const ctx = await setupTest('release');

  await ctx.mergeItem();

  ctx.putReleases([
    { tag: 'v2.0.0-rc.1', publishedAt: 2000, isContaining: true, prerelease: true },
    { tag: 'v1.0.0', publishedAt: 1000, isContaining: false },
  ]);

  const shipped = await ctx.watch();

  expect(shipped).toStrictEqual([]);
});

test('it ships with a prerelease when the rule allows prereleases', async () => {
  const ctx = await setupTest('prerelease');

  await ctx.mergeItem();

  ctx.putReleases([
    { tag: 'v2.0.0-rc.1', publishedAt: 2000, isContaining: true, prerelease: true },
    { tag: 'v1.0.0', publishedAt: 1000, isContaining: false },
  ]);

  const shipped = await ctx.watch();

  expect(shipped.map((row) => row.ref)).toStrictEqual(['v2.0.0-rc.1']);
});

test('it ships by release then deploy when the deploy tag holds a bump that names a release', async () => {
  const ctx = await setupTest('releaseThenDeploy');
  const item = await ctx.mergeItem();

  const body = 'Bump app to https://github.com/example/app/releases/tag/v2.0.0.';

  ctx.putReleases(ctx.twoReleases);
  ctx.putDeploy([ctx.buildBump(41, 2500, body, 'Bot')], [ctx.buildSha(41)]);

  const shipped = await ctx.watch();

  const received: unknown = shipped.map((row) => [row.itemId, row.rule, row.ref, row.release]);

  expect(received).toStrictEqual([[item, 'release-then-deploy', 'deployed/prod/app', 'v2.0.0']]);
});

test('it counts a bump that names the oldest containing release', async () => {
  const ctx = await setupTest('releaseThenDeploy');

  const body = 'Bump app to https://github.com/example/app/releases/tag/v1.0.0';

  await ctx.mergeItem();

  ctx.putReleases(ctx.twoReleases);
  ctx.putDeploy([ctx.buildBump(41, 2500, body, 'Bot')], [ctx.buildSha(41)]);

  const shipped = await ctx.watch();

  expect(shipped.map((row) => row.release)).toStrictEqual(['v1.0.0']);
});

test.each([
  {
    title: 'a bump of a User author',
    tag: 'v1.0.0',
    mergedAt: 2500,
    author: 'User' as const,
    isHeld: true,
  },
  {
    title: 'a bump that names no release of the repo',
    tag: 'v0.5.0',
    mergedAt: 2500,
    author: 'Bot' as const,
    isHeld: true,
  },
  {
    title: 'a bump that names a longer tag than the release',
    tag: 'v1.0.01',
    mergedAt: 2500,
    author: 'Bot' as const,
    isHeld: true,
  },
  {
    title: 'a bump merged before the release was published',
    tag: 'v1.0.0',
    mergedAt: 500,
    author: 'Bot' as const,
    isHeld: true,
  },
  {
    title: 'a deploy tag that lacks the counted bump',
    tag: 'v1.0.0',
    mergedAt: 2500,
    author: 'Bot' as const,
    isHeld: false,
  },
])('it ships nothing by release then deploy for $title', async (row) => {
  const ctx = await setupTest('releaseThenDeploy');

  const body = `https://github.com/example/app/releases/tag/${row.tag}`;

  await ctx.mergeItem();

  const heldIndex = row.isHeld ? 41 : 1;
  const holds = [ctx.buildSha(heldIndex)];

  ctx.putReleases(ctx.twoReleases);
  ctx.putDeploy([ctx.buildBump(41, row.mergedAt, body, row.author)], holds);

  const shipped = await ctx.watch();

  expect(shipped).toStrictEqual([]);
});

test('it reads each repo once, before any other call there, for items that share it', async () => {
  const ctx = await setupTest('deployTag');

  await ctx.mergeItem({ number: 7 });
  await ctx.mergeItem({ number: 8 });

  ctx.putTag('deployed/prod', ctx.buildSha(9), [ctx.mergeCommit]);

  const before = ctx.forge.calls.length;

  await ctx.watch();

  const calls = ctx.forge.calls.slice(before);

  expect(calls.filter((call) => call === `readRepo ${ctx.app}`)).toHaveLength(1);
  expect(calls.at(0)).toBe(`readRepo ${ctx.app}`);
});

test('it makes no forge call for an item whose pull request has not merged', async () => {
  const ctx = await setupTest('deployTag');

  await ctx.mergeItem({ isMerged: false });

  const before = ctx.forge.calls.length;

  const shipped = await ctx.watch();

  expect([shipped, ctx.forge.calls.length]).toStrictEqual([[], before]);
});

test('it makes no forge call for a repo that ships nothing', async () => {
  const ctx = await setupTest('none');

  await ctx.mergeItem();

  const before = ctx.forge.calls.length;

  await ctx.watch();

  expect(ctx.forge.calls.length).toBe(before);
});

test('it logs a repo the App cannot read, makes no other call there, and the item waits', async () => {
  const ctx = await setupTest('deployTag');
  const item = await ctx.mergeItem();

  const before = ctx.forge.calls.length;

  const shipped = await ctx.watch();
  const state = await ctx.readState(item);

  expect(shipped).toStrictEqual([]);
  expect(ctx.forge.calls.slice(before)).toStrictEqual([`readRepo ${ctx.app}`]);

  expect(ctx.warnings).toStrictEqual([
    'the App cannot read a repo that a ships rule names {"repo":"example/app"}',
  ]);

  expect(state).toStrictEqual({ state: 'waiting', reason: 'wait:shipped' });
});

test('it writes nothing when a forge call throws, and reads again on the next pass', async () => {
  const ctx = await setupTest('deployTag');
  const item = await ctx.mergeItem();

  ctx.putTag('deployed/prod', ctx.buildSha(9), [ctx.mergeCommit]);
  ctx.forge.setDown(true);

  const failed = await ctx.watch();
  const afterFailure = await ctx.readShipped(item);

  ctx.forge.setDown(false);

  const next = await ctx.watch();

  expect([failed, afterFailure, next.map((row) => row.ref)]).toStrictEqual([
    [],
    [],
    ['deployed/prod'],
  ]);

  expect(ctx.warnings).toHaveLength(1);
});

test('it writes no second row for an item that shipped already, and makes no call for it', async () => {
  const ctx = await setupTest('deployTag');

  await ctx.mergeItem();

  ctx.putTag('deployed/prod', ctx.buildSha(9), [ctx.mergeCommit]);

  await ctx.watch();

  const before = ctx.forge.calls.length;

  const second = await ctx.watch();
  const facts = await ctx.listShippedFacts();

  expect(second).toStrictEqual([]);
  expect(ctx.forge.calls.length).toBe(before);
  expect(facts).toHaveLength(1);
});

test('it runs while the runner is paused', async () => {
  const ctx = await setupTest('deployTag');

  await ctx.mergeItem();
  await ctx.store.exclusive((tx) => tx.applyChange(buildMockPauseChange(ctx.runner)));

  ctx.putTag('deployed/prod', ctx.buildSha(9), [ctx.mergeCommit]);

  const shipped = await ctx.watch();

  expect(shipped).toHaveLength(1);
});

test('it ignores a closed item', async () => {
  const ctx = await setupTest('deployTag');
  const item = await ctx.mergeItem();

  await ctx.closeItem(item, 'not needed');

  ctx.putTag('deployed/prod', ctx.buildSha(9), [ctx.mergeCommit]);

  const shipped = await ctx.watch();

  expect(shipped).toStrictEqual([]);
});

test('it ignores an item of a repo the server does not serve', async () => {
  const ctx = await setupTest('deployTag');

  await ctx.mergeItem();

  ctx.putTag('deployed/prod', ctx.buildSha(9), [ctx.mergeCommit]);

  const shipped = await ctx.watchWithNoRepos();

  expect(shipped).toStrictEqual([]);
});
