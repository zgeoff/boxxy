import { expect, test } from 'bun:test';
import type { AttemptRow, CommitSha } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { linkPullRequest } from '../pull-requests/link-pull-request.ts';
import { createFakeForge } from '../test-utils/create-fake-forge.ts';
import { createFakeVerifier } from '../test-utils/create-fake-verifier.ts';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { recordEvidence } from './record-evidence.ts';
import type { EvidenceDraft } from './types.ts';

async function setupTest() {
  const repo = brandSchemas.repoName.parse('example/app');
  const firstHead = brandSchemas.commitSha.parse('1'.repeat(40));
  const secondHead = brandSchemas.commitSha.parse('2'.repeat(40));
  const gateCheck = 'verify / gate';

  const dispatch = await createTestDispatch();

  const forge = createFakeForge();
  const verifier = createFakeVerifier();

  const startBuild = async (): Promise<AttemptRow> => {
    await dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });

    const claim = await dispatch.claim();

    invariant(claim?.attempt.phase === 'build', 'the claim picks the build');

    return dispatch.readAttempt(claim.attempt.id);
  };

  const putPullRequest = (state: 'open' | 'closed', head: CommitSha) => {
    forge.seed({
      ref: { repo, number: 7 },
      githubId: 9_000_007,
      reading: { state, mergedAt: null, mergeCommit: null, commits: [], head },
    });
  };

  const linkOpenPullRequest = async (attempt: AttemptRow, head: CommitSha) => {
    putPullRequest('open', head);

    const linked = await linkPullRequest({
      store: dispatch.store,
      forge,
      rules: dispatch.rules(),
      call: dispatch.buildCallRef(attempt),
      url: `https://github.com/${repo}/pull/7`,
      now: dispatch.clock.now(),
      newId: dispatch.newId,
    });

    invariant(linked.kind === 'linked', 'the pull request links');
  };

  return {
    repo,
    firstHead,
    secondHead,
    gateCheck,
    ...dispatch,
    forge,
    verifier,
    startBuild,
    putPullRequest,
    linkOpenPullRequest,
    putChecks: (head: CommitSha, checks: Record<string, 'success' | 'failure' | 'pending'>) => {
      forge.seedChecks({ repo, head, checks });
    },
    record: (attempt: AttemptRow, draft: EvidenceDraft, options: { hasForge?: boolean } = {}) =>
      recordEvidence({
        store: dispatch.store,
        forge: options.hasForge === false ? null : forge,
        verifier: options.hasForge === false ? null : verifier,
        gateCheck,
        rules: dispatch.rules(),
        call: dispatch.buildCallRef(attempt),
        draft,
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      }),
    readEvidence: (attempt: AttemptRow) => dispatch.store.read((tx) => tx.listEvidence(attempt.id)),
  };
}

test('it records a check run in success with the head it read', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.startBuild();

  await ctx.linkOpenPullRequest(attempt, ctx.firstHead);

  ctx.putChecks(ctx.firstHead, { 'pr / checks': 'success' });

  const answer = await ctx.record(attempt, { kind: 'check', ref: 'pr / checks' });
  const rows = await ctx.readEvidence(attempt);
  const facts = await ctx.listFacts('boxxy.evidence.recorded');

  expect(answer).toStrictEqual({ kind: 'recorded', factId: expect.any(String) });

  expect(rows.map((row) => [row.kind, row.ref, row.observed, row.head])).toStrictEqual([
    ['pull_request', `https://github.com/${ctx.repo}/pull/7`, null, null],
    ['check', 'pr / checks', null, ctx.firstHead],
  ]);

  expect(facts.map((fact) => fact.payload)).toStrictEqual([
    { attempt: attempt.id, kind: 'check', ref: 'pr / checks', observed: null, head: ctx.firstHead },
  ]);
});

test('it records free text with no head, as before', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.startBuild();

  await ctx.record(attempt, { kind: 'test', ref: 'bun test', observed: '42 passed' });

  const rows = await ctx.readEvidence(attempt);
  const facts = await ctx.listFacts('boxxy.evidence.recorded');

  expect(rows.map((row) => [row.kind, row.observed, row.head])).toStrictEqual([
    ['test', '42 passed', null],
  ]);

  expect(facts.map((fact) => fact.payload)).toStrictEqual([
    { attempt: attempt.id, kind: 'test', ref: 'bun test', observed: '42 passed' },
  ]);

  expect(ctx.forge.calls).toStrictEqual([]);
});

test('it records a verdict when the gate passed and the report lists the feature', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.startBuild();

  await ctx.linkOpenPullRequest(attempt, ctx.firstHead);

  ctx.putChecks(ctx.firstHead, { [ctx.gateCheck]: 'success' });
  ctx.verifier.setFeatures(['file-item']);

  const answer = await ctx.record(attempt, { kind: 'verdict', ref: 'file-item' });
  const rows = await ctx.readEvidence(attempt);

  expect(answer).toStrictEqual({ kind: 'recorded', factId: expect.any(String) });

  expect(rows.map((row) => [row.kind, row.ref, row.head])).toContainEqual([
    'verdict',
    'file-item',
    ctx.firstHead,
  ]);
});

test.each([
  { state: 'pending', reason: 'check-pending' },
  { state: 'failure', reason: 'check-failed' },
] as const)('it refuses a check in $state and writes no row and no fact', async (row) => {
  const ctx = await setupTest();
  const attempt = await ctx.startBuild();

  await ctx.linkOpenPullRequest(attempt, ctx.firstHead);

  ctx.putChecks(ctx.firstHead, { 'pr / checks': row.state });

  const answer = await ctx.record(attempt, { kind: 'check', ref: 'pr / checks' });
  const rows = await ctx.readEvidence(attempt);
  const facts = await ctx.listFacts('boxxy.evidence.recorded');

  expect(answer).toStrictEqual({
    kind: 'refused',
    reason: row.reason,
    check: 'pr / checks',
    head: ctx.firstHead,
  });

  expect(rows.map((found) => found.kind)).toStrictEqual(['pull_request']);
  expect(facts).toStrictEqual([]);
});

test('it refuses a check that only a commit status carries as check-missing', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.startBuild();

  await ctx.linkOpenPullRequest(attempt, ctx.firstHead);

  ctx.forge.seedChecks({
    repo: ctx.repo,
    head: ctx.firstHead,
    checks: {},
    statuses: { 'pr / checks': 'success' },
  });

  const answer = await ctx.record(attempt, { kind: 'check', ref: 'pr / checks' });

  expect(answer).toStrictEqual({
    kind: 'refused',
    reason: 'check-missing',
    check: 'pr / checks',
    head: ctx.firstHead,
  });
});

test('it refuses a verdict whose feature the report lacks as verdict-missing', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.startBuild();

  await ctx.linkOpenPullRequest(attempt, ctx.firstHead);

  ctx.putChecks(ctx.firstHead, { [ctx.gateCheck]: 'success' });

  const answer = await ctx.record(attempt, { kind: 'verdict', ref: 'file-item' });

  expect(answer).toStrictEqual({
    kind: 'refused',
    reason: 'verdict-missing',
    feature: 'file-item',
    head: ctx.firstHead,
  });
});

test('it returns the first fact ID and writes nothing for a repeat at the same head', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.startBuild();

  await ctx.linkOpenPullRequest(attempt, ctx.firstHead);

  ctx.putChecks(ctx.firstHead, { 'pr / checks': 'success' });

  const first = await ctx.record(attempt, { kind: 'check', ref: 'pr / checks' });
  const repeat = await ctx.record(attempt, { kind: 'check', ref: 'pr / checks' });
  const rows = await ctx.readEvidence(attempt);
  const facts = await ctx.listFacts('boxxy.evidence.recorded');

  expect(repeat).toStrictEqual(first);
  expect(rows.filter((row) => row.kind === 'check')).toHaveLength(1);
  expect(facts).toHaveLength(1);
});

test('it writes a new row and a new fact for the same check at a new head', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.startBuild();

  await ctx.linkOpenPullRequest(attempt, ctx.firstHead);

  ctx.putChecks(ctx.firstHead, { 'pr / checks': 'success' });
  ctx.putChecks(ctx.secondHead, { 'pr / checks': 'success' });

  const first = await ctx.record(attempt, { kind: 'check', ref: 'pr / checks' });

  ctx.putPullRequest('open', ctx.secondHead);

  const second = await ctx.record(attempt, { kind: 'check', ref: 'pr / checks' });
  const rows = await ctx.readEvidence(attempt);

  expect(second).not.toStrictEqual(first);

  expect(rows.filter((row) => row.kind === 'check').map((row) => row.head)).toStrictEqual([
    ctx.firstHead,
    ctx.secondHead,
  ]);
});

test('it refuses a check with no forge', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.startBuild();

  const answer = await ctx.record(
    attempt,
    { kind: 'check', ref: 'pr / checks' },
    { hasForge: false },
  );

  expect(answer).toStrictEqual({ kind: 'refused', reason: 'no-forge' });
});

test('it refuses a check of an item with no linked pull request', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.startBuild();
  const answer = await ctx.record(attempt, { kind: 'check', ref: 'pr / checks' });

  expect(answer).toStrictEqual({ kind: 'refused', reason: 'no-pull-request' });
});

test('it refuses a check of a closed pull request', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.startBuild();

  await ctx.linkOpenPullRequest(attempt, ctx.firstHead);

  ctx.putPullRequest('closed', ctx.firstHead);

  const answer = await ctx.record(attempt, { kind: 'check', ref: 'pr / checks' });

  expect(answer).toStrictEqual({ kind: 'refused', reason: 'pull-request-closed' });
});

test('it answers retry and writes nothing when the forge does not answer', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.startBuild();

  await ctx.linkOpenPullRequest(attempt, ctx.firstHead);

  ctx.forge.setDown(true);

  const answer = await ctx.record(attempt, { kind: 'check', ref: 'pr / checks' });
  const rows = await ctx.readEvidence(attempt);
  const facts = await ctx.listFacts('boxxy.evidence.recorded');

  expect(answer).toStrictEqual({ kind: 'retry' });
  expect(rows.map((row) => row.kind)).toStrictEqual(['pull_request']);
  expect(facts).toStrictEqual([]);
});

test('it refuses a call from a session that no attempt holds before it reads the forge', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.startBuild();

  const answer = await ctx.record(
    { ...attempt, id: brandSchemas.attemptId.parse('0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f') },
    { kind: 'check', ref: 'pr / checks' },
  );

  expect(answer).toStrictEqual({ kind: 'refused', reason: 'not-current' });
  expect(ctx.forge.calls).toStrictEqual([]);
});
