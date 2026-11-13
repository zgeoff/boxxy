import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadVerifyJobRules } from '@boxxy/dispatch/test-utils/load-verify-job-rules';
import { brandSchemas, toJSONValue } from '@boxxy/model';
import type { AttemptRow, CheckState, CommitSha, ItemId } from '@boxxy/model';
import { buildMockGateReading } from '@boxxy/model/test-utils/build-mock-gate-reading';
import { createSQLiteClaimStore } from '@boxxy/store-sqlite';
import { renderReportMarkdown } from '@wringer/core';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { createTestCLI } from '../test-utils/create-test-cli.ts';
import { readJSONOutput } from '../test-utils/read-json-output.ts';

// The CLI against the real server three ways: on the memory store with a design attempt whose
// session calls, on the SQLite store with a restart of the server (`recovery`), and on the verify
// job rules, whose tick reviews, verifies and merges a pull request (`mergeAndHold`).
async function setupTest() {
  const cli = await createTestCLI();

  const attemptRef = z.object({ id: z.string() });
  const closeOutShape = z.object({ phase: z.string(), outcomes: z.array(z.string()) });
  const listedRef = z.object({ id: z.string() });
  const listedSchema = z.object({ kind: z.string(), items: z.array(listedRef) });

  const currentSchema = z.object({
    kind: z.string(),
    attempt: attemptRef,
    closeOut: closeOutShape,
  });

  const designed = {
    kind: 'designed',
    design: { text: 'Follow the system theme.', location: null },
  };

  const designBody = JSON.stringify({ result: designed, friction: [] });

  const attempt = await cli.server.seedStartedAttempt(brandSchemas.phaseName.parse('design'));

  cli.server.callerProof.setCaller(attempt.caller);

  const folder = await mkdtemp(join(tmpdir(), 'boxxy-test-review-restart-'));

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  const store = await createSQLiteClaimStore(join(folder, 'boxxy.db'));

  onTestFinished(() => store.close());

  const before = await createTestCLI({ store });
  const mergeCLI = await createTestCLI();

  const server = mergeCLI.server;
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
    const sessionAttempt = await claimNextStep(item);

    server.callerProof.setCaller(sessionAttempt.caller);

    const body = await buildBody();
    const closed = await mergeCLI.run(['attempt', 'close-out'], { stdin: JSON.stringify(body) });

    invariant(closed.exitCode === 0, `the close-out records: ${closed.stdout}${closed.stderr}`);

    server.dispatch.worker.setSession(sessionAttempt.id, {
      state: 'running',
      attention: 'turn-ended',
    });

    await server.tick();
    await server.tick();

    return server.dispatch.readAttempt(sessionAttempt.id);
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
      const evidence = await mergeCLI.run([
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
    currentSchema,
    listedSchema,
    designBody,
    attempt,
    recovery: {
      before,
      restart: () => createTestCLI({ restartOf: before.server }),
      claimReview: async () => {
        await before.server.dispatch.seedBuildWithPullRequest(before.server.forge, 7);

        const claim = await before.server.dispatch.claim();

        invariant(claim?.attempt.phase === 'review', 'the claim picks the review of the item');

        return before.server.dispatch.readAttempt(claim.attempt.id);
      },
    },
    mergeAndHold: {
      ...mergeCLI,
      repo,
      pushHead,
      runGradedMerge,
      runRepair,
      readDerived: async (item: ItemId) => {
        const shown = await mergeCLI.run(['item', 'show', item]);

        return readJSONOutput(shown, showSchema).item.derived;
      },
      countMergeFacts: async () => {
        const requested = await server.dispatch.listFacts('boxxy.merge.requested');
        const answered = await server.dispatch.listFacts('boxxy.merge.answered');
        const merged = await server.dispatch.listFacts('boxxy.pull_request.merged');

        return { requested: requested.length, answered: answered.length, merged: merged.length };
      },
    },
  };
}

test('#attempt current prints the attempt of the calling session and the close-out it takes', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['attempt', 'current']);

  const current = readJSONOutput(result, ctx.currentSchema);

  expect([result.exitCode, current.attempt.id, current.closeOut.phase]).toStrictEqual([
    0,
    ctx.attempt.id,
    'design',
  ]);
});

test('#attempt current exits 2 and says to try again when no session holds the caller', async () => {
  const ctx = await setupTest();

  ctx.server.callerProof.setCaller({ issuer: 'fake-worker', subject: 'another-machine' });

  const result = await ctx.run(['attempt', 'current']);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 2,
    stderr: 'no attempt for this session yet; try again in 5 seconds\n',
  });
});

test('#attempt current exits 1 when the caller cannot be proven', async () => {
  const ctx = await setupTest();

  ctx.server.callerProof.setCaller(null);

  const result = await ctx.run(['attempt', 'current']);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 1,
    stderr: 'error: UNAUTHORIZED: Unauthorized\n',
  });
});

test('#attempt close-out records the close-out from stdin and prints its fact ID', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['attempt', 'close-out'], { stdin: ctx.designBody });
  const [fact] = await ctx.server.dispatch.listFacts('boxxy.attempt.closed_out');

  expect({ exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }).toStrictEqual(
    {
      exitCode: 0,
      stdout: `${fact?.factId}\n`,
      stderr: '',
    },
  );
});

test('#attempt close-out prints the same fact ID when the same body arrives again', async () => {
  const ctx = await setupTest();
  const first = await ctx.run(['attempt', 'close-out'], { stdin: ctx.designBody });
  const repeat = await ctx.run(['attempt', 'close-out'], { stdin: ctx.designBody });

  expect(repeat).toStrictEqual(first);
});

test('#attempt close-out exits 1 and lists every problem for a body the schema rejects', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['attempt', 'close-out'], { stdin: '{"friction":"none"}' });

  expect({ exitCode: result.exitCode, stdout: result.stdout }).toStrictEqual({
    exitCode: 1,
    stdout: '',
  });

  expect(result.stderr.split('\n').filter((line) => line !== '').length).toBeGreaterThan(0);
});

test('#attempt close-out exits 1 for a different body after the first valid one', async () => {
  const ctx = await setupTest();

  await ctx.run(['attempt', 'close-out'], { stdin: ctx.designBody });

  const result = await ctx.run(['attempt', 'close-out'], {
    stdin: JSON.stringify({
      result: { kind: 'designed', design: { text: 'Another design.', location: null } },
      friction: [],
    }),
  });

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 1,
    stderr: 'this attempt already has a close-out, and the first valid close-out is final\n',
  });
});

test('#attempt close-out exits 2 and sends nothing when stdin is not JSON', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['attempt', 'close-out'], { stdin: 'not json' });
  const facts = await ctx.server.dispatch.listFacts('boxxy.attempt.closed_out');

  expect({ exitCode: result.exitCode, stderr: result.stderr, facts }).toStrictEqual({
    exitCode: 2,
    stderr: 'error: stdin is not JSON\n',
    facts: [],
  });
});

test('#attempt evidence records one piece of evidence and prints its ID', async () => {
  const ctx = await setupTest();

  const result = await ctx.run([
    'attempt',
    'evidence',
    '--kind',
    'test',
    '--ref',
    'theme.test.ts: follows the system',
    '--observed',
    '42 passed',
  ]);

  const [fact] = await ctx.server.dispatch.listFacts('boxxy.evidence.recorded');

  expect({ exitCode: result.exitCode, stdout: result.stdout }).toStrictEqual({
    exitCode: 0,
    stdout: `${fact?.factId}\n`,
  });
});

test('#attempt evidence exits 2 for a kind that does not exist', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['attempt', 'evidence', '--kind', 'hunch', '--ref', 'a feeling']);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 2,
    stderr: 'error: --kind takes one of: test, ci-run, live-check\n',
  });
});

test('#attempt list-items prints the items of the repo of the session that hold the text', async () => {
  const ctx = await setupTest();

  const filed = await ctx.run([
    'item',
    'file',
    '--repo',
    'example/app',
    '--title',
    'Add a theme toggle',
    '--outcome',
    'The header has a theme toggle.',
  ]);

  const toggle = readJSONOutput(filed, z.object({ item: z.string() })).item;

  const result = await ctx.run(['attempt', 'list-items', '--text', 'toggle']);

  const listed = readJSONOutput(result, ctx.listedSchema);

  expect({ exitCode: result.exitCode, listed }).toStrictEqual({
    exitCode: 0,
    listed: { kind: 'items', items: [{ id: toggle }] },
  });
});

test('#attempt show-item exits 1 with NOT_FOUND for a held item', async () => {
  const ctx = await setupTest();

  const filed = await ctx.run([
    'item',
    'file',
    '--repo',
    'example/app',
    '--title',
    'Draft a new palette',
    '--outcome',
    'The palette is chosen.',
    '--held',
    'still a draft',
  ]);

  const draft = readJSONOutput(filed, z.object({ item: z.string() })).item;

  const result = await ctx.run(['attempt', 'show-item', draft]);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 1,
    stderr: `error: NOT_FOUND: no such item {"item":"${draft}"}\n`,
  });
});

test('it records a review close-out sent again after a restart between the post and the store once, with no second review', async () => {
  const setup = await setupTest();

  const ctx = setup.recovery;

  const review = await ctx.claimReview();

  const reading = buildMockGateReading({ status: 'passed' });
  const body = JSON.stringify(toJSONValue(reading));

  ctx.before.server.callerProof.setCaller(review.caller);

  const buildFacts = await ctx.before.server.dispatch.listFacts('boxxy.attempt.closed_out');

  const hold = ctx.before.server.dispatch.reviewGate.holdAfterNextPost();
  const lost = ctx.before.run(['attempt', 'close-out'], { stdin: body });

  await hold.entered;

  const after = await ctx.restart();

  after.server.callerProof.setCaller(review.caller);

  const sent = await after.run(['attempt', 'close-out'], { stdin: body });

  hold.release();

  const late = await lost;
  const stored = await after.server.dispatch.readAttempt(review.id);
  const allFacts = await after.server.dispatch.listFacts('boxxy.attempt.closed_out');

  const facts = allFacts.slice(buildFacts.length);

  const attempts = await after.server.deps.store.read((tx) => tx.listItemAttempts(review.item));

  expect({
    sent: [sent.exitCode, sent.stdout],
    late: [late.exitCode, late.stdout],
    posts:
      ctx.before.server.dispatch.reviewGate.posted.length +
      after.server.dispatch.reviewGate.posted.length,
    closeOut: stored.closeOut,
    facts: facts.length,
    reviews: attempts.filter((attempt) => attempt.phase === 'review').length,
  }).toStrictEqual({
    sent: [0, `${facts[0]?.factId}\n`],
    late: [0, `${facts[0]?.factId}\n`],
    posts: 2,
    closeOut: { round: 1, cause: 'first', reading, unrelatedLines: null },
    facts: 1,
    reviews: 1,
  });
});

test('it takes an item through build, review, verify and a merge at its head with no person', async () => {
  const setup = await setupTest();

  const ctx = setup.mergeAndHold;
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
  const setup = await setupTest();

  const ctx = setup.mergeAndHold;
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
