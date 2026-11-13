import { expect, test } from 'bun:test';
import { loadVerifyJobRules } from '@boxxy/dispatch/test-utils/load-verify-job-rules';
import { brandSchemas, toJSONValue } from '@boxxy/model';
import type { AttemptRow, CheckState, CommitSha, ItemId } from '@boxxy/model';
import { buildMockGateReading } from '@boxxy/model/test-utils/build-mock-gate-reading';
import { renderReportMarkdown } from '@wringer/core';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { createTestCLI } from '../src/test-utils/create-test-cli.ts';
import { readJSONOutput } from '../src/test-utils/read-json-output.ts';

async function setupTest() {
  const cli = await createTestCLI();

  const server = cli.server;
  const rules = loadVerifyJobRules();
  const repo = brandSchemas.repoName.parse('example/app');

  server.dispatch.setRules(rules);

  await server.deps.store.exclusive((tx) =>
    tx.syncLimits(rules.limits, server.dispatch.clock.now()),
  );

  // the tick claims the item's next step, and starts or wakes its session
  const claimNextStep = async (item: ItemId): Promise<AttemptRow> => {
    await server.tick();

    const attempts = await server.deps.store.read((tx) => tx.listItemAttempts(item));

    const latest = attempts.at(-1);

    invariant(latest !== undefined, 'the item has an attempt');

    return latest;
  };

  // The pull request #7 at its latest commit, with a verify report in its body, and the checks
  // at that head.
  const pushHead = (
    commits: readonly CommitSha[],
    checks: Readonly<Record<string, CheckState>>,
  ) => {
    const head = commits.at(-1);

    invariant(head !== undefined, 'a push has a commit');

    server.forge.seed({
      ref: { repo, number: 7 },
      githubId: 9_000_007,
      reading: {
        state: 'open',
        mergedAt: null,
        mergeCommit: null,
        commits: commits.map((sha) => ({ sha, message: 'Follow the system theme' })),
      },
      body: [
        'Follow the system theme.',
        '',
        renderReportMarkdown({
          version: 1,
          base: 'origin/main',
          fingerprint: '0f1e2d3c4b5a6978',
          complete: true,
          features: [
            {
              name: 'theme',
              changed: true,
              status: 'verified',
              verdict: {
                feature: 'theme',
                fingerprint: '0f1e2d3c4b5a6978',
                run: 'run-theme-1',
                at: '2026-11-01T09:00:00Z',
                evidence: [],
              },
            },
          ],
          unmapped: [],
        }),
      ].join('\n'),
    });

    server.forge.seedChecks({ repo, head, checks });
  };

  // The tick claims the item's next step. Its session sends its close-out through the CLI and
  // ends its turn; the next tick stops the session, and the one after settles the attempt.
  const runSession = async (item: ItemId, buildBody: () => Promise<unknown>) => {
    const attempt = await claimNextStep(item);

    server.callerProof.setCaller(attempt.caller);

    const body = await buildBody();
    const closed = await cli.run(['attempt', 'close-out'], { stdin: JSON.stringify(body) });

    invariant(closed.exitCode === 0, `the close-out records: ${closed.stdout}${closed.stderr}`);

    server.dispatch.worker.setSession(attempt.id, { state: 'running', attention: 'turn-ended' });

    await server.tick();
    await server.tick();

    return server.dispatch.readAttempt(attempt.id);
  };

  // A review that passes the head, a verify that closes out verified, and the merge: the tick
  // that claims the merge reads it, and a second read 30 seconds later sees the merge it asked for.
  const runGradedMerge = async (item: ItemId, head: CommitSha) => {
    const review = await runSession(item, () =>
      Promise.resolve(toJSONValue(buildMockGateReading({ status: 'passed', head }))),
    );

    const verify = await runSession(item, () =>
      Promise.resolve({ result: { kind: 'verified' }, friction: [] }),
    );

    const claimed = await claimNextStep(item);

    server.dispatch.clock.advance(30_000);

    await server.tick();

    const merge = await server.dispatch.readAttempt(claimed.id);

    return [review, verify, merge].map((row) => [row.phase, row.outcome]);
  };

  // The rework session wakes on the kept session, records its evidence through the CLI, pushes
  // the commits, and closes out built.
  const runRepair = async (
    item: ItemId,
    commits: readonly CommitSha[],
    checks: Readonly<Record<string, CheckState>>,
  ) => {
    const build = await runSession(item, async () => {
      const evidence = await cli.run([
        'attempt',
        'evidence',
        '--kind',
        'test',
        '--ref',
        'theme.test.ts: follows the system',
        '--observed',
        '12 passed',
      ]);

      pushHead(commits, checks);

      const [from, to] = commits.slice(-2);

      invariant(from !== undefined && to !== undefined, 'a repair pushes onto a reviewed head');

      server.forge.seedCompare({
        repo,
        from,
        to,
        files: [{ path: 'src/theme.ts', changedLines: 4 }],
      });

      return {
        result: { kind: 'built' },
        criteria: [{ criterion: 'a1', evidence: evidence.stdout.trim() }],
        openItems: [],
        friction: [],
      };
    });

    return [build.phase, build.outcome, build.atcSession];
  };

  const derivedSchema = z.object({ state: z.string(), reason: z.string().optional() });
  const showSchema = z.object({ item: z.object({ derived: derivedSchema }) });

  return {
    ...cli,
    repo,
    pushHead,
    runGradedMerge,
    runRepair,
    readDerived: async (item: ItemId) => {
      const shown = await cli.run(['item', 'show', item]);

      return readJSONOutput(shown, showSchema).item.derived;
    },
    countMergeFacts: async () => {
      const requested = await server.dispatch.listFacts('boxxy.merge.requested');
      const answered = await server.dispatch.listFacts('boxxy.merge.answered');
      const merged = await server.dispatch.listFacts('boxxy.pull_request.merged');

      return { requested: requested.length, answered: answered.length, merged: merged.length };
    },
  };
}

test('it takes an item through build, review, verify and a merge at its head with no person', async () => {
  const ctx = await setupTest();

  const server = ctx.server;
  const head = brandSchemas.commitSha.parse('5d0c1a2b3e4f5061728394a5b6c7d8e9f0a1b2c3');

  const build = await server.dispatch.seedBuildWithPullRequest(server.forge, 7);

  ctx.pushHead([head], { 'pr / checks': 'success', build: 'success', 'verify / gate': 'success' });
  server.forge.seedRequiredChecks({ repo: ctx.repo, branch: 'main', checks: ['build'] });

  const steps = await ctx.runGradedMerge(build.item, head);
  const settledFacts = await ctx.countMergeFacts();

  await server.watch();

  const seen: unknown = {
    steps,
    merges: server.forge.calls.filter((call) => call.startsWith('mergeAtHead')),
    settledFacts,
    watchedFacts: await ctx.countMergeFacts(),
    derived: await ctx.readDerived(build.item),
    told: server.notifier.told,
    logged: server.logged,
  };

  expect(seen).toStrictEqual({
    steps: [
      ['review', 'passed'],
      ['verify', 'verified'],
      ['merge', 'merged'],
    ],
    merges: [`mergeAtHead example/app#7 ${head} squash`],
    settledFacts: { requested: 1, answered: 1, merged: 1 },
    watchedFacts: { requested: 1, answered: 1, merged: 1 },
    derived: { state: 'done' },
    told: [],
    logged: [],
  });
});

test('it sends a red required check to a repair build three times, and holds the item with a notice at the fourth repair', async () => {
  const ctx = await setupTest();

  const server = ctx.server;
  const red = { 'pr / checks': 'success', build: 'failure', 'verify / gate': 'success' } as const;

  const heads = [
    '1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d',
    '2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e',
    '3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f',
    '4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f70',
  ].map((sha) => brandSchemas.commitSha.parse(sha));

  const [first, second, third, fourth] = heads;

  invariant(
    first !== undefined && second !== undefined && third !== undefined && fourth !== undefined,
    'the test names four heads',
  );

  const build = await server.dispatch.seedBuildWithPullRequest(server.forge, 7);

  ctx.pushHead([first], red);
  server.forge.seedRequiredChecks({ repo: ctx.repo, branch: 'main', checks: ['build'] });

  const steps = [
    ...(await ctx.runGradedMerge(build.item, first)),
    await ctx.runRepair(build.item, [first, second], red),
    ...(await ctx.runGradedMerge(build.item, second)),
    await ctx.runRepair(build.item, [first, second, third], red),
    ...(await ctx.runGradedMerge(build.item, third)),
    await ctx.runRepair(build.item, heads, red),
    ...(await ctx.runGradedMerge(build.item, fourth)),
  ];

  const seen: unknown = {
    steps,
    merges: server.forge.calls.filter((call) => call.startsWith('mergeAtHead')),
    derived: await ctx.readDerived(build.item),
    told: server.notifier.told.map((notice) => [notice.item, notice.reason]),
  };

  const repairRound = [
    ['review', 'passed'],
    ['verify', 'verified'],
    ['merge', 'repair'],
  ];

  const repair = ['build', 'built', build.atcSession];

  expect(seen).toStrictEqual({
    steps: [...repairRound, repair, ...repairRound, repair, ...repairRound, repair, ...repairRound],
    merges: [],
    derived: { state: 'waiting', reason: 'rounds used up' },
    told: [[build.item, 'rounds used up']],
  });
});
