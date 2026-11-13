import { expect, test } from 'bun:test';
import { z } from 'zod';
import type { FactType, WorkFacts } from './types.ts';
import { workFactSchemas } from './work-fact-schemas.ts';

// Each schema's output and its payload type, made readonly all the way down, must be the same
// type. `satisfies` in the schema file checks one direction only.
type DeepReadonly<T> = T extends readonly (infer E)[]
  ? readonly DeepReadonly<E>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

// each type is assignable to the other
type IsEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type MismatchedFactType = {
  [T in FactType]: IsEqual<
    DeepReadonly<z.output<(typeof workFactSchemas)[T]>>,
    DeepReadonly<WorkFacts[T]>
  > extends true
    ? never
    : T;
}[FactType];

test('it gives each fact type a schema whose output is its payload type', () => {
  const mismatched: [MismatchedFactType] extends [never] ? 'none' : MismatchedFactType = 'none';

  expect(mismatched).toBe('none');
});

test('it has a schema for each of the 30 fact types', () => {
  expect(Object.keys(workFactSchemas)).toHaveLength(30);
});

test.each([
  [
    'boxxy.item.filed',
    {
      id: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
      kind: 'core.issue',
      repo: 'acme/widgets',
      title: 'Add a retry button',
      outcome: 'A failed upload can be sent again',
      body: '## Context\n\nUploads fail on a weak network.',
      acceptance: [{ id: 'a1', text: 'The button sends the upload again', evidence: [] }],
      fields: { designMode: 'attended' },
      labels: ['uploads'],
      foundInAttempt: null,
      filedBy: 'boxxy:owner:local',
      filedAt: 1_762_300_000_000,
      closedAt: null,
      closeReason: null,
    },
  ],
  ['boxxy.item.noted', { seq: 1, text: 'Keep the old button until the next release' }],
  [
    'boxxy.item.edited',
    {
      body: '## Scope\n\nThe upload row only.',
      fields: { designMode: 'agent' },
      byAttempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
    },
  ],
  [
    'boxxy.item.closed',
    {
      reason: 'Duplicate of an older item',
      byAttempt: null,
      ended: [{ attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f', how: 'closing' }],
    },
  ],
  [
    'boxxy.relation.added',
    {
      source: '0192f0c4-7b1f-7c22-8e01-6a4b2d9f1c30',
      target: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
      type: 'blocks',
    },
  ],
  [
    'boxxy.relation.removed',
    {
      source: '0192f0c4-7b1f-7c22-8e01-6a4b2d9f1c30',
      target: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
      type: 'relates-to',
    },
  ],
  [
    'boxxy.lever.recorded',
    {
      seq: 7,
      kind: 'item.retry',
      item: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
      until: null,
      expiresAt: null,
      reason: 'Try the build again',
      phase: 'build',
      actor: 'boxxy:owner:local',
      at: 1_762_300_000_000,
    },
  ],
  [
    'boxxy.attempt.claimed',
    {
      attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
      phase: 'design',
      number: 2,
      round: 1,
      mode: 'attended',
      pool: 'main',
      fields: { designMode: ['attended'] },
      seats: [{ limit: 'workers' }],
      recipeHash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      skillsRef: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
      rulesVersion: '60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752',
    },
  ],
  [
    'boxxy.decision.recorded',
    {
      id: '0192f0c5-2b3c-7d4e-9f50-6a7b8c9d0e1f',
      attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
      item: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
      kind: 'wake',
      pool: 'main',
      rulesVersion: '60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752',
      snapshotHash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      snapshotStoreVersion: 42,
      pepysOffsets: { 'facts.boxxy.work': 12 },
      faults: [],
      limits: [{ limit: 'workers', held: 3, max: 3 }],
      at: 1_762_300_000_000,
    },
  ],
  [
    'boxxy.attempt.started',
    {
      attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
      atcSession: 'sess-01',
      resumeFallback: false,
      caller: { issuer: 'https://issuer.example.test', subject: 'session-41' },
    },
  ],
  [
    'boxxy.attempt.spawn_unanswered',
    { attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f', reason: 'the host gave no answer in 30 s' },
  ],
  [
    'boxxy.attempt.reconciled',
    {
      attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
      atcSession: 'sess-01',
      resumeFallback: true,
      caller: null,
    },
  ],
  [
    'boxxy.attempt.session_bound',
    {
      attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
      atcSession: 'sess-01',
      agentSession: 'agent-7f3a',
      product: 'claude_code',
      source: 'hook',
      seenAt: 1_762_300_000_000,
    },
  ],
  [
    'boxxy.attempt.slept',
    { attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f', idleSince: 1_762_300_000_000, asked: true },
  ],
  [
    'boxxy.attempt.wake_requested',
    { attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f', by: 'command' },
  ],
  [
    'boxxy.attempt.woken',
    {
      attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
      holdGen: 2,
      seats: [{ limit: 'workers' }],
      overCap: true,
    },
  ],
  [
    'boxxy.attempt.resumed',
    {
      attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
      atcSession: 'sess-01',
      caller: { issuer: 'https://issuer.example.test', subject: 'session-41' },
    },
  ],
  [
    'boxxy.attempt.closed_out',
    {
      attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
      phase: 'design',
      closeOut: {
        result: {
          kind: 'designed',
          design: { text: 'One retry button per upload row', location: null },
        },
        friction: [],
        frictionDropped: 0,
      },
      hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    },
  ],
  [
    'boxxy.attempt.timed_out',
    { attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f', phase: 'build', afterMinutes: 90 },
  ],
  ['boxxy.attempt.turn_ended', { attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f', phase: 'build' }],
  [
    'boxxy.attempt.settled',
    {
      attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
      phase: 'build',
      round: 2,
      state: 'failed',
      failure: 'stalled',
      outcome: 'lost',
      returnedOutcome: null,
      closing: 'stalled',
      asleep: false,
      sessionStopped: true,
      endedAt: 1_762_300_000_000,
      criteria: [],
      matched: [],
      frictionDropped: 0,
      skippedEffects: [{ effect: 'file-item', reason: 'the item holds' }],
    },
  ],
  [
    'boxxy.proposal.recorded',
    {
      attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
      target: { kind: 'skill', name: 'testing' },
      change: 'Say where to seed faker',
    },
  ],
  [
    'boxxy.evidence.recorded',
    {
      attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
      kind: 'test',
      ref: 'src/upload.test.ts it retries an upload',
      observed: '12 pass',
    },
  ],
  [
    'boxxy.pull_request.linked',
    {
      attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
      repo: 'acme/widgets',
      number: 41,
      url: 'https://github.com/acme/widgets/pull/41',
      pullRequestId: '9001',
      source: 'watch',
    },
  ],
  [
    'boxxy.commit.linked',
    {
      attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
      repo: 'acme/widgets',
      sha: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
      pullRequestNumber: 41,
    },
  ],
  [
    'boxxy.pull_request.merged',
    {
      attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
      repo: 'acme/widgets',
      number: 41,
      pullRequestId: '9001',
      mergedAt: 1_762_300_000_000,
      mergeCommit: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
    },
  ],
  [
    'boxxy.pull_request.closed',
    {
      attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
      repo: 'acme/widgets',
      number: 41,
      pullRequestId: '9001',
    },
  ],
  [
    'boxxy.attempt.job_started',
    { attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f', worker: 'merge.forge' },
  ],
  [
    'boxxy.merge.requested',
    {
      attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
      repo: 'acme/widgets',
      number: 41,
      head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
      method: 'squash',
      required: ['pr / checks', 'verify / gate'],
    },
  ],
  [
    'boxxy.merge.answered',
    {
      attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
      head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
      answer: 'merged',
      mergeCommit: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
    },
  ],
] satisfies readonly (readonly [FactType, Readonly<Record<string, unknown>>])[])(
  'it accepts an example %s payload',
  (type, payload) => {
    const parsed: unknown = workFactSchemas[type].safeParse(payload).data;

    expect(parsed).toStrictEqual(payload);
  },
);

test.each([
  ['boxxy.item.filed', ['labels'], { labels: 'uploads' }],
  ['boxxy.item.noted', ['text'], { seq: 1, text: '' }],
  ['boxxy.item.edited', ['byAttempt'], { title: 'Add a retry button to uploads' }],
  ['boxxy.item.closed', ['ended', 0, 'how'], { ended: [{ how: 'gone' }] }],
  ['boxxy.relation.added', ['target'], { type: 'blocks' }],
  ['boxxy.relation.removed', ['source'], { type: 'blocks' }],
  ['boxxy.lever.recorded', ['phase'], { kind: 'item.retry' }],
  ['boxxy.attempt.claimed', ['seats', 0, 'limit'], { seats: [{ limit: '' }] }],
  ['boxxy.decision.recorded', ['kind'], { kind: 'stop' }],
  ['boxxy.attempt.started', ['caller'], { resumeFallback: false }],
  ['boxxy.attempt.spawn_unanswered', ['attempt'], { reason: 'the host gave no answer' }],
  ['boxxy.attempt.reconciled', ['caller', 'subject'], { caller: { issuer: 'https://a.test' } }],
  ['boxxy.attempt.session_bound', ['product'], { product: 'other' }],
  ['boxxy.attempt.slept', ['asked'], { idleSince: 1_762_300_000_000 }],
  ['boxxy.attempt.wake_requested', ['by'], { by: 'timer' }],
  ['boxxy.attempt.woken', ['holdGen'], { holdGen: 0 }],
  ['boxxy.attempt.resumed', ['atcSession'], { caller: null }],
  ['boxxy.attempt.closed_out', ['hash'], { phase: 'build' }],
  ['boxxy.attempt.timed_out', ['afterMinutes'], { afterMinutes: 0 }],
  ['boxxy.attempt.turn_ended', ['phase'], { attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f' }],
  ['boxxy.attempt.settled', ['skippedEffects'], { state: 'succeeded' }],
  ['boxxy.proposal.recorded', ['attempt'], { change: 'Say where to seed faker' }],
  ['boxxy.evidence.recorded', ['kind'], { kind: 'screenshot' }],
  ['boxxy.pull_request.linked', ['source'], { source: 'owner' }],
  ['boxxy.commit.linked', ['sha'], { pullRequestNumber: 41 }],
  ['boxxy.pull_request.merged', ['pullRequestId'], { pullRequestId: 'PR_9001' }],
  ['boxxy.pull_request.closed', ['pullRequestId'], { number: 41 }],
  ['boxxy.attempt.job_started', ['worker'], { worker: '' }],
  ['boxxy.merge.requested', ['method'], { method: 'fast-forward' }],
  ['boxxy.merge.answered', ['answer'], { answer: 'unknown' }],
] satisfies readonly (readonly [
  FactType,
  readonly (string | number)[],
  Readonly<Record<string, unknown>>,
])[])('it rejects a %s payload with a bad %p', (type, path, payload) => {
  expect(workFactSchemas[type].safeParse(payload).error?.issues).toPartiallyContain({ path });
});

test.each(Object.entries(workFactSchemas))(
  'it leaves the store version key of %s free for the sink',
  (_type, schema) => {
    expect(Object.keys(schema.shape)).not.toContain('storeVersion');
  },
);

test.each(Object.entries(workFactSchemas))(
  'it lets the wire schema of %s add a store version',
  (_type, schema) => {
    expect(() => schema.extend({ storeVersion: z.number().int() })).not.toThrow();
  },
);

test('it reads a filed fact stored before the body existed as one with an empty body', () => {
  const stored = {
    id: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
    kind: 'core.issue',
    repo: 'acme/widgets',
    title: 'Add a retry button',
    outcome: 'A failed upload can be sent again',
    acceptance: [],
    fields: {},
    labels: [],
    foundInAttempt: null,
    filedBy: 'boxxy:owner:local',
    filedAt: 1_762_300_000_000,
    closedAt: null,
    closeReason: null,
  };

  const parsed: unknown = workFactSchemas['boxxy.item.filed'].safeParse(stored).data;

  expect(parsed).toStrictEqual({ ...stored, body: '' });
});

test('it reads a reconciled fact stored before the fallback flag existed as one with no fallback', () => {
  const stored = {
    attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
    atcSession: 'sess-01',
    caller: null,
  };

  const parsed: unknown = workFactSchemas['boxxy.attempt.reconciled'].safeParse(stored).data;

  expect(parsed).toStrictEqual({ ...stored, resumeFallback: false });
});

test('it reads the close-out fact of a v1 review as one with the reading of its head', () => {
  const stored = {
    attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
    phase: 'review',
    closeOut: {
      verdict: { kind: 'passed' },
      noslop: {
        version: 7,
        reviewID: 'review-3c9a',
        head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
        counts: { findings: 0, failedCalls: 0, fixChecks: 0 },
        reportBytes: 2,
        report: {},
      },
      friction: [],
      frictionDropped: 0,
    },
    hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  };

  const parsed: unknown = workFactSchemas['boxxy.attempt.closed_out'].safeParse(stored).data;

  expect(parsed).toStrictEqual({
    ...stored,
    closeOut: {
      round: null,
      cause: null,
      reading: {
        status: 'passed',
        head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
        open: { high: 0, medium: 0, low: 0 },
        closedWithoutFix: 0,
        findingPaths: [],
        cost: { calls: [] },
        ref: 'review-3c9a',
        answerHint: '',
      },
      unrelatedLines: null,
    },
  });
});
