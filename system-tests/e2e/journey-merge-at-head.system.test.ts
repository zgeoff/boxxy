import { expect, test } from 'bun:test';
import { loadJobRules } from '@boxxy/dispatch/test-utils/load-job-rules';
import { brandSchemas } from '@boxxy/model';
import { buildMockGateReading } from '@boxxy/model/test-utils/build-mock-gate-reading';
import { renderReportMarkdown } from '@wringer/core';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { createTestCLI } from '../src/test-utils/create-test-cli.ts';
import { readJSONOutput } from '../src/test-utils/read-json-output.ts';

async function setupTest() {
  const cli = await createTestCLI();

  const server = cli.server;
  const rules = loadJobRules();

  server.dispatch.setRules(rules);

  const now = server.dispatch.clock.now();

  await server.deps.store.exclusive((tx) => tx.syncLimits(rules.limits, now));

  const derivedSchema = z.object({ state: z.string() });
  const showSchema = z.object({ item: z.object({ derived: derivedSchema }) });

  return {
    ...cli,
    readState: async (item: string) => {
      const shown = await cli.run(['item', 'show', item]);

      return readJSONOutput(shown, showSchema).item.derived.state;
    },
    countMergeFacts: async () => {
      const requested = await server.dispatch.listFacts('boxxy.merge.requested');
      const answered = await server.dispatch.listFacts('boxxy.merge.answered');
      const merged = await server.dispatch.listFacts('boxxy.pull_request.merged');

      return { requested: requested.length, answered: answered.length, merged: merged.length };
    },
  };
}

test('it merges a reviewed pull request at its head through the server tick, and the item reads done', async () => {
  const ctx = await setupTest();

  const server = ctx.server;
  const repo = brandSchemas.repoName.parse('example/app');
  const head = brandSchemas.commitSha.parse('5d0c1a2b3e4f5061728394a5b6c7d8e9f0a1b2c3');

  const build = await server.dispatch.seedBuildWithPullRequest(server.forge, 7);

  server.forge.seed({
    ref: { repo, number: 7 },
    githubId: 9_000_007,
    reading: {
      state: 'open',
      mergedAt: null,
      mergeCommit: null,
      commits: [{ sha: head, message: 'Follow the system theme' }],
    },
    body: [
      'Follow the system theme.',
      '',
      renderReportMarkdown({
        version: 1,
        base: 'origin/main',
        fingerprint: '0f1e2d3c4b5a6978',
        complete: true,
        features: [{ name: 'theme', changed: false, status: 'unchanged', verdict: null }],
        unmapped: [],
      }),
    ].join('\n'),
  });

  server.forge.seedRequiredChecks({ repo, branch: 'main', checks: ['build'] });

  server.forge.seedChecks({
    repo,
    head,
    checks: { 'pr / checks': 'success', build: 'success', 'verify / gate': 'success' },
  });

  const review = await server.dispatch.claim();

  invariant(review !== null, 'the review claims after the build');

  const reviewRow = await server.dispatch.readAttempt(review.attempt.id);

  await server.dispatch.closeAndSettle(reviewRow, {
    round: 1,
    cause: 'first',
    reading: buildMockGateReading({ status: 'passed', head }),
    unrelatedLines: null,
  });

  await server.tick();

  server.dispatch.clock.advance(30_000);

  await server.tick();

  const settledFacts = await ctx.countMergeFacts();

  await server.watch();

  const seen: unknown = {
    merges: server.forge.calls.filter((call) => call.startsWith('mergeAtHead')),
    settledFacts,
    watchedFacts: await ctx.countMergeFacts(),
    state: await ctx.readState(build.item),
    logged: server.logged,
  };

  expect(seen).toStrictEqual({
    merges: [`mergeAtHead example/app#7 ${head} squash`],
    settledFacts: { requested: 1, answered: 1, merged: 1 },
    watchedFacts: { requested: 1, answered: 1, merged: 1 },
    state: 'done',
    logged: [],
  });
});
