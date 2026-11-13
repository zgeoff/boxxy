import { expect, test } from 'bun:test';
import { createFakeForge } from '@boxxy/dispatch/test-utils/create-fake-forge';
import { brandSchemas } from '@boxxy/model';
import { renderReportMarkdown } from '@wringer/core';
import { createWringerVerifier } from './create-wringer-verifier.ts';
import { buildMockWringerReport } from './test-utils/build-mock-wringer-report.ts';

function setupTest() {
  const forge = createFakeForge();
  const repo = brandSchemas.repoName.parse('example/app');

  return {
    forge,
    repo,
    ref: { repo, number: 87 },
    head: brandSchemas.commitSha.parse('3f2a91c'.padEnd(40, '0')),
    verifier: createWringerVerifier({ forge, gateCheck: 'verify / gate' }),
  };
}

test('it reads verified, with the report features, when the gate passed at the head', async () => {
  const ctx = setupTest();

  const report = buildMockWringerReport({
    features: [
      { name: 'item-list', status: 'verified' },
      { name: 'runner', status: 'unchanged' },
    ],
  });

  ctx.forge.seed({
    ref: ctx.ref,
    githubId: 7_000_087,
    reading: { state: 'open', mergedAt: null, mergeCommit: null, commits: [] },
    body: `Fix the item list.\n\n${renderReportMarkdown(report)}`,
  });

  ctx.forge.seedChecks({
    repo: ctx.repo,
    head: ctx.head,
    checks: { 'pr / checks': 'success', 'verify / gate': 'success' },
  });

  const reading = await ctx.verifier.readAt(ctx.ref, ctx.head);

  expect(reading).toStrictEqual({
    status: 'verified',
    head: ctx.head,
    features: [
      { name: 'item-list', status: 'verified' },
      { name: 'runner', status: 'unchanged' },
    ],
  });
});

test('it reads incomplete, with the report features, when the gate failed at the head', async () => {
  const ctx = setupTest();

  const report = buildMockWringerReport({
    features: [
      { name: 'item-list', status: 'verified' },
      { name: 'merge', status: 'stale' },
    ],
  });

  ctx.forge.seed({
    ref: ctx.ref,
    githubId: 7_000_087,
    reading: { state: 'open', mergedAt: null, mergeCommit: null, commits: [] },
    body: renderReportMarkdown(report),
  });

  ctx.forge.seedChecks({ repo: ctx.repo, head: ctx.head, checks: { 'verify / gate': 'failure' } });

  const reading = await ctx.verifier.readAt(ctx.ref, ctx.head);

  expect(reading).toStrictEqual({
    status: 'incomplete',
    head: ctx.head,
    features: [
      { name: 'item-list', status: 'verified' },
      { name: 'merge', status: 'stale' },
    ],
  });
});

test('it reads incomplete with no features when the gate passed and the body holds no report', async () => {
  const ctx = setupTest();

  ctx.forge.seed({
    ref: ctx.ref,
    githubId: 7_000_087,
    reading: { state: 'open', mergedAt: null, mergeCommit: null, commits: [] },
    body: 'Fix the item list.',
  });

  ctx.forge.seedChecks({ repo: ctx.repo, head: ctx.head, checks: { 'verify / gate': 'success' } });

  const reading = await ctx.verifier.readAt(ctx.ref, ctx.head);

  expect(reading).toStrictEqual({
    status: 'incomplete',
    head: ctx.head,
    features: [],
  });
});

test('it reads incomplete with no features when the report in the body does not parse', async () => {
  const ctx = setupTest();

  ctx.forge.seed({
    ref: ctx.ref,
    githubId: 7_000_087,
    reading: { state: 'open', mergedAt: null, mergeCommit: null, commits: [] },
    body: '<!-- wringer-report v1\n{"version": 1, "features": \n-->',
  });

  ctx.forge.seedChecks({ repo: ctx.repo, head: ctx.head, checks: { 'verify / gate': 'success' } });

  const reading = await ctx.verifier.readAt(ctx.ref, ctx.head);

  expect(reading).toStrictEqual({
    status: 'incomplete',
    head: ctx.head,
    features: [],
  });
});

test('it reads not-covered, and never reads the body, when the head has no gate run', async () => {
  const ctx = setupTest();
  const report = buildMockWringerReport({ features: [{ name: 'item-list', status: 'verified' }] });

  ctx.forge.seed({
    ref: ctx.ref,
    githubId: 7_000_087,
    reading: { state: 'open', mergedAt: null, mergeCommit: null, commits: [] },
    body: renderReportMarkdown(report),
  });

  ctx.forge.seedChecks({ repo: ctx.repo, head: ctx.head, checks: { 'pr / checks': 'success' } });

  const reading = await ctx.verifier.readAt(ctx.ref, ctx.head);

  expect([reading, ctx.forge.calls]).toStrictEqual([
    { status: 'not-covered', head: ctx.head },
    [`readChecks example/app ${ctx.head}`],
  ]);
});

test.each(['pending', 'other'] as const)(
  'it reads not-covered when the gate run at the head is %s',
  async (gate) => {
    const ctx = setupTest();

    const report = buildMockWringerReport({
      features: [{ name: 'item-list', status: 'verified' }],
    });

    ctx.forge.seed({
      ref: ctx.ref,
      githubId: 7_000_087,
      reading: { state: 'open', mergedAt: null, mergeCommit: null, commits: [] },
      body: renderReportMarkdown(report),
    });

    ctx.forge.seedChecks({ repo: ctx.repo, head: ctx.head, checks: { 'verify / gate': gate } });

    const reading = await ctx.verifier.readAt(ctx.ref, ctx.head);

    expect(reading).toStrictEqual({
      status: 'not-covered',
      head: ctx.head,
    });
  },
);

test('it reads not-covered when a commit status, and no check run, carries the gate name', async () => {
  const ctx = setupTest();
  const report = buildMockWringerReport({ features: [{ name: 'item-list', status: 'verified' }] });

  ctx.forge.seed({
    ref: ctx.ref,
    githubId: 7_000_087,
    reading: { state: 'open', mergedAt: null, mergeCommit: null, commits: [] },
    body: renderReportMarkdown(report),
  });

  ctx.forge.seedChecks({
    repo: ctx.repo,
    head: ctx.head,
    checks: {},
    statuses: { 'verify / gate': 'success' },
  });

  const reading = await ctx.verifier.readAt(ctx.ref, ctx.head);

  expect(reading).toStrictEqual({
    status: 'not-covered',
    head: ctx.head,
  });
});

test('it reads not-covered when the gate passed only at an older head', async () => {
  const ctx = setupTest();
  const olderHead = brandSchemas.commitSha.parse('9c01e2d'.padEnd(40, '0'));
  const report = buildMockWringerReport({ features: [{ name: 'item-list', status: 'verified' }] });

  ctx.forge.seed({
    ref: ctx.ref,
    githubId: 7_000_087,
    reading: { state: 'open', mergedAt: null, mergeCommit: null, commits: [] },
    body: renderReportMarkdown(report),
  });

  ctx.forge.seedChecks({ repo: ctx.repo, head: olderHead, checks: { 'verify / gate': 'success' } });

  const reading = await ctx.verifier.readAt(ctx.ref, ctx.head);

  expect(reading).toStrictEqual({
    status: 'not-covered',
    head: ctx.head,
  });
});

test('it rejects when the forge does not answer', () => {
  const ctx = setupTest();

  ctx.forge.setDown(true);

  expect(ctx.verifier.readAt(ctx.ref, ctx.head)).rejects.toThrow('the fake forge is down');
});
