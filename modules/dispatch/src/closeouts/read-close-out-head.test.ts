import { expect, test } from 'bun:test';
import type { AttemptRow, CommitSha, FactId, Forge } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockEvidenceRow } from '@boxxy/model/test-utils/build-mock-evidence-row';
import invariant from 'tiny-invariant';
import { recordEvidence } from '../evidence/record-evidence.ts';
import type { EvidenceDraft } from '../evidence/types.ts';
import { linkPullRequest } from '../pull-requests/link-pull-request.ts';
import { createFakeForge } from '../test-utils/create-fake-forge.ts';
import { createFakeVerifier } from '../test-utils/create-fake-verifier.ts';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { closeOutCall } from './close-out-call.ts';

async function setupTest() {
  const repo = brandSchemas.repoName.parse('example/app');
  const firstHead = brandSchemas.commitSha.parse('1'.repeat(40));
  const secondHead = brandSchemas.commitSha.parse('2'.repeat(40));
  const criterion = brandSchemas.criterionId.parse('a1');

  const dispatch = await createTestDispatch();

  const forge = createFakeForge();
  const verifier = createFakeVerifier();

  await dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });

  const claim = await dispatch.claim();

  invariant(claim?.attempt.phase === 'build', 'the claim picks the build');

  const attempt = await dispatch.readAttempt(claim.attempt.id);

  const putPullRequest = (state: 'open' | 'closed' | 'merged', head: CommitSha) => {
    forge.seed({
      ref: { repo, number: 7 },
      githubId: 9_000_007,
      reading: { state, mergedAt: null, mergeCommit: null, commits: [], head },
    });
  };

  putPullRequest('open', firstHead);

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

  forge.seedChecks({ repo, head: firstHead, checks: { 'pr / checks': 'success' } });
  forge.seedChecks({ repo, head: secondHead, checks: { 'pr / checks': 'success' } });

  const record = async (draft: EvidenceDraft): Promise<FactId> => {
    const answer = await recordEvidence({
      store: dispatch.store,
      forge,
      verifier,
      gateCheck: 'verify / gate',
      rules: dispatch.rules(),
      call: dispatch.buildCallRef(attempt),
      draft,
      now: dispatch.clock.now(),
      newId: dispatch.newId,
    });

    invariant(answer.kind === 'recorded', 'the evidence records');

    return answer.factId;
  };

  return {
    repo,
    firstHead,
    secondHead,
    criterion,
    ...dispatch,
    forge,
    attempt,
    putPullRequest,
    record,
    closeOut: (row: AttemptRow, body: unknown, options: { forge?: Forge | null } = {}) =>
      closeOutCall({
        store: dispatch.store,
        call: dispatch.buildCallRef(row),
        body,
        rules: dispatch.rules(),
        now: dispatch.clock.now(),
        newId: dispatch.newId,
        review: null,
        forge: options.forge === undefined ? forge : options.forge,
      }),
    buildBody: (evidence: FactId, result: unknown) => ({
      result,
      criteria: [{ criterion: 'a1', evidence }],
      openItems: [],
      friction: [],
    }),
  };
}

test('it records a built close-out whose check was recorded at the current head', async () => {
  const ctx = await setupTest();
  const evidence = await ctx.record({ kind: 'check', ref: 'pr / checks' });
  const answer = await ctx.closeOut(ctx.attempt, ctx.buildBody(evidence, { kind: 'built' }));

  expect(answer).toStrictEqual({
    kind: 'recorded',
    attempt: ctx.attempt.id,
    factId: expect.any(String),
    repeat: false,
  });
});

test('it rejects a built close-out whose check was recorded at an older head', async () => {
  const ctx = await setupTest();
  const evidence = await ctx.record({ kind: 'check', ref: 'pr / checks' });

  ctx.putPullRequest('open', ctx.secondHead);

  const answer = await ctx.closeOut(ctx.attempt, ctx.buildBody(evidence, { kind: 'built' }));

  expect(answer).toStrictEqual({
    kind: 'rejected',
    problems: [
      {
        kind: 'stale-evidence',
        criterion: ctx.criterion,
        evidence,
        recordedAt: ctx.firstHead,
        head: ctx.secondHead,
        cause: null,
      },
    ],
  });
});

test.each(['closed', 'merged'] as const)(
  'it rejects a built close-out whose pull request is %s, with a null head',
  async (state) => {
    const ctx = await setupTest();
    const evidence = await ctx.record({ kind: 'check', ref: 'pr / checks' });

    ctx.putPullRequest(state, ctx.firstHead);

    const answer = await ctx.closeOut(ctx.attempt, ctx.buildBody(evidence, { kind: 'built' }));

    expect(answer).toStrictEqual({
      kind: 'rejected',
      problems: [
        {
          kind: 'stale-evidence',
          criterion: ctx.criterion,
          evidence,
          recordedAt: ctx.firstHead,
          head: null,
          cause: 'closed',
        },
      ],
    });
  },
);

test.each([
  { title: 'the server has no forge', cause: 'no-forge', forge: null },
  {
    title: 'GitHub no longer finds the pull request',
    cause: 'not-found',
    forge: createFakeForge(),
  },
] as const)('it rejects a built close-out with a null head when $title', async (row) => {
  const ctx = await setupTest();
  const evidence = await ctx.record({ kind: 'check', ref: 'pr / checks' });

  const answer = await ctx.closeOut(ctx.attempt, ctx.buildBody(evidence, { kind: 'built' }), {
    forge: row.forge,
  });

  expect(answer).toStrictEqual({
    kind: 'rejected',
    problems: [
      {
        kind: 'stale-evidence',
        criterion: ctx.criterion,
        evidence,
        recordedAt: ctx.firstHead,
        head: null,
        cause: row.cause,
      },
    ],
  });
});

test('it rejects a built close-out with a null head when the item has no linked pull request', async () => {
  const ctx = await setupTest();
  const other = await createTestDispatch();

  await other.seedItem({ phase: brandSchemas.phaseName.parse('build') });

  const claim = await other.claim();

  invariant(claim?.attempt.phase === 'build', 'the claim picks the build');

  const otherAttempt = await other.readAttempt(claim.attempt.id);

  await other.store.exclusive(async (tx) => {
    await tx.applyChange({
      at: other.clock.now(),
      writes: [
        {
          op: 'insert',
          table: 'evidence',
          row: buildMockEvidenceRow({
            attempt: otherAttempt.id,
            kind: 'check',
            ref: 'pr / checks',
            head: ctx.firstHead,
          }),
        },
      ],
      facts: [],
    });
  });

  const rows = await other.store.read((tx) => tx.listEvidence(otherAttempt.id));

  const [cited] = rows;

  invariant(cited !== undefined, 'the check row is stored');

  const answer = await closeOutCall({
    store: other.store,
    call: other.buildCallRef(otherAttempt),
    body: ctx.buildBody(cited.factId, { kind: 'built' }),
    rules: other.rules(),
    now: other.clock.now(),
    newId: other.newId,
    review: null,
    forge: createFakeForge(),
  });

  expect(answer).toStrictEqual({
    kind: 'rejected',
    problems: [
      {
        kind: 'stale-evidence',
        criterion: ctx.criterion,
        evidence: cited.factId,
        recordedAt: ctx.firstHead,
        head: null,
        cause: 'no-pull-request',
      },
    ],
  });
});

test('it answers retry and settles nothing when the head read fails', async () => {
  const ctx = await setupTest();
  const evidence = await ctx.record({ kind: 'check', ref: 'pr / checks' });

  ctx.forge.setDown(true);

  const answer = await ctx.closeOut(ctx.attempt, ctx.buildBody(evidence, { kind: 'built' }));
  const after = await ctx.readAttempt(ctx.attempt.id);

  expect(answer).toStrictEqual({ kind: 'retry' });
  expect([after.state, after.closeOutFact]).toStrictEqual([ctx.attempt.state, null]);
});

test.each([
  { kind: 'blocked', reason: 'CI is down' },
  { kind: 'abandoned', reason: 'The work is not needed' },
] as const)('it never reads the forge for a $kind close-out', async (result) => {
  const ctx = await setupTest();
  const evidence = await ctx.record({ kind: 'check', ref: 'pr / checks' });

  const callsBefore = ctx.forge.calls.length;

  ctx.forge.setDown(true);

  const answer = await ctx.closeOut(ctx.attempt, ctx.buildBody(evidence, result));

  expect(answer).toStrictEqual({
    kind: 'recorded',
    attempt: ctx.attempt.id,
    factId: expect.any(String),
    repeat: false,
  });

  expect(ctx.forge.calls.slice(callsBefore)).toStrictEqual([]);
});

test('it never reads the forge for a built close-out that cites no check or verdict', async () => {
  const ctx = await setupTest();
  const evidence = await ctx.record({ kind: 'test', ref: 'bun test', observed: '42 passed' });

  const callsBefore = ctx.forge.calls.length;

  ctx.forge.setDown(true);

  const answer = await ctx.closeOut(ctx.attempt, ctx.buildBody(evidence, { kind: 'built' }));

  expect(answer).toStrictEqual({
    kind: 'recorded',
    attempt: ctx.attempt.id,
    factId: expect.any(String),
    repeat: false,
  });

  expect(ctx.forge.calls.slice(callsBefore)).toStrictEqual([]);
});

test('it never reads the forge for a body its schema rejects', async () => {
  const ctx = await setupTest();
  const evidence = await ctx.record({ kind: 'check', ref: 'pr / checks' });

  const callsBefore = ctx.forge.calls.length;

  const answer = await ctx.closeOut(ctx.attempt, {
    ...ctx.buildBody(evidence, { kind: 'built' }),
    openItems: 'none',
  });

  expect(answer.kind).toBe('rejected');
  expect(ctx.forge.calls.slice(callsBefore)).toStrictEqual([]);
});

test('it answers a resend of a recorded close-out without reading the forge', async () => {
  const ctx = await setupTest();
  const evidence = await ctx.record({ kind: 'check', ref: 'pr / checks' });

  const body = ctx.buildBody(evidence, { kind: 'built' });

  await ctx.closeOut(ctx.attempt, body);

  const callsBefore = ctx.forge.calls.length;

  ctx.forge.setDown(true);

  const answer = await ctx.closeOut(ctx.attempt, body);

  expect(answer).toStrictEqual({
    kind: 'recorded',
    attempt: ctx.attempt.id,
    factId: expect.any(String),
    repeat: true,
  });

  expect(ctx.forge.calls.slice(callsBefore)).toStrictEqual([]);
});

test('it records a built close-out that sends its own frictionDropped and an untargeted friction entry', async () => {
  const ctx = await setupTest();
  const evidence = await ctx.record({ kind: 'check', ref: 'pr / checks' });

  const answer = await ctx.closeOut(ctx.attempt, {
    ...ctx.buildBody(evidence, { kind: 'built' }),
    frictionDropped: 3,
    friction: [{ change: 'Allow 5 in parsers' }],
  });

  expect(answer).toStrictEqual({
    kind: 'recorded',
    attempt: ctx.attempt.id,
    factId: expect.any(String),
    repeat: false,
  });
});
