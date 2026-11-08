import { expect, test } from 'bun:test';
import { factSchemas } from './fact-schemas.ts';
import type { FactType } from './types/facts.ts';

test.each([
  [
    'boxxy.item.filed',
    {
      id: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
      kind: 'core.issue',
      repo: 'acme/widgets',
      title: 'Add a retry button',
      outcome: 'A failed upload can be sent again',
      acceptance: [{ id: 'a1', text: 'The button sends the upload again', evidence: [] }],
      foundInAttempt: null,
      filedBy: 'boxxy:owner:local',
      filedAt: 1_762_300_000_000,
      closedAt: null,
      closeReason: null,
    },
  ],
  ['boxxy.item.edited', { title: 'Add a retry button to uploads' }],
  ['boxxy.item.closed', { reason: 'Duplicate of an older item' }],
  [
    'boxxy.link.added',
    {
      source: '0192f0c4-7b1f-7c22-8e01-6a4b2d9f1c30',
      target: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
      type: 'blocks',
    },
  ],
  [
    'boxxy.link.removed',
    {
      source: '0192f0c4-7b1f-7c22-8e01-6a4b2d9f1c30',
      target: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
      type: 'blocks',
    },
  ],
  [
    'boxxy.lever.recorded',
    {
      seq: 7,
      kind: 'plan.defer',
      item: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
      until: 1_762_400_000_000,
      expiresAt: null,
      reason: 'Wait for the design review',
      actor: 'boxxy:owner:local',
      at: 1_762_300_000_000,
    },
  ],
  [
    'boxxy.attempt.claimed',
    {
      item: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
      phase: 'build',
      number: 1,
      pool: 'build',
      slot: 1,
      gen: 1,
      recipeHash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      rulesVersion: '60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752',
    },
  ],
  [
    'boxxy.decision.recorded',
    {
      id: '0192f0c5-2b3c-7d4e-9f50-6a7b8c9d0e1f',
      attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
      item: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
      pool: 'build',
      rulesVersion: '60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752',
      snapshotHash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      storeVersion: 42,
      pepysOffsets: {},
      faults: [
        {
          plugin: 'oldest',
          kind: 'signal',
          item: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
          error: 'the signal threw',
        },
      ],
      at: 1_762_300_000_000,
    },
  ],
  ['boxxy.attempt.started', { atcSession: 'sess-01' }],
  ['boxxy.attempt.reconciling', { reason: 'atc gave no answer in 30 s' }],
  ['boxxy.attempt.reconciled', { atcSession: 'sess-02' }],
  [
    'boxxy.attempt.session_bound',
    { atcSession: 'sess-01', agentSession: 'agent-7f3a', seenAt: 1_762_300_000_000 },
  ],
  [
    'boxxy.attempt.closed_out',
    {
      closeOut: {
        result: { kind: 'built' },
        criteria: [{ criterion: 'a1', evidence: 'manual:0192f0c5-3c4d-7e5f-a061-7b8c9d0e1f2a' }],
        openItems: [],
        friction: [],
        frictionDropped: 0,
      },
    },
  ],
  [
    'boxxy.attempt.settled',
    {
      state: 'failed',
      failure: 'session-lost',
      endedAt: 1_762_300_000_000,
      criteria: [],
      matched: [],
      frictionDropped: 0,
    },
  ],
  [
    'boxxy.evidence.recorded',
    { kind: 'test', ref: 'src/upload.test.ts it retries an upload', observed: '12 pass' },
  ],
  [
    'boxxy.evidence.pr_linked',
    { repo: 'acme/widgets', number: 41, url: 'https://github.com/acme/widgets/pull/41' },
  ],
  [
    'boxxy.evidence.commit_linked',
    { repo: 'acme/widgets', sha: 'e83c5163316f89bfbde7d9ab23ca2e25604af290', pr: 41 },
  ],
  [
    'boxxy.pr.merged',
    {
      repo: 'acme/widgets',
      number: 41,
      mergedAt: 1_762_300_000_000,
      mergeCommit: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
    },
  ],
  ['boxxy.pr.closed', { repo: 'acme/widgets', number: 41 }],
  [
    'boxxy.proposal.recorded',
    { target: { kind: 'skill', name: 'testing' }, change: 'Say where to seed faker' },
  ],
  ['boxxy.runner.paused', { runner: 'runner-1' }],
  ['boxxy.runner.resumed', { runner: 'runner-1' }],
] satisfies readonly (readonly [FactType, Readonly<Record<string, unknown>>])[])(
  'it accepts an example %s payload',
  (type, payload) => {
    const built: unknown = factSchemas[type].safeParse(payload).data;

    expect(built).toStrictEqual(payload);
  },
);

test.each([
  [
    'boxxy.item.filed',
    'title',
    ['title'],
    {
      id: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
      kind: 'core.issue',
      repo: 'acme/widgets',
      outcome: 'A failed upload can be sent again',
      acceptance: [{ id: 'a1', text: 'The button sends the upload again', evidence: [] }],
      foundInAttempt: null,
      filedBy: 'boxxy:owner:local',
      filedAt: 1_762_300_000_000,
      closedAt: null,
      closeReason: null,
    },
  ],
  ['boxxy.item.edited', 'title', [], {}],
  ['boxxy.item.closed', 'reason', ['reason'], {}],
  [
    'boxxy.link.added',
    'target',
    ['target'],
    { source: '0192f0c4-7b1f-7c22-8e01-6a4b2d9f1c30', type: 'blocks' },
  ],
  [
    'boxxy.link.removed',
    'source',
    ['source'],
    { target: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77', type: 'blocks' },
  ],
  [
    'boxxy.lever.recorded',
    'until',
    ['until'],
    {
      seq: 7,
      kind: 'plan.defer',
      item: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
      expiresAt: null,
      reason: 'Wait for the design review',
      actor: 'boxxy:owner:local',
      at: 1_762_300_000_000,
    },
  ],
  [
    'boxxy.attempt.claimed',
    'recipeHash',
    ['recipeHash'],
    {
      item: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
      phase: 'build',
      number: 1,
      pool: 'build',
      slot: 1,
      gen: 1,
      rulesVersion: '60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752',
    },
  ],
  [
    'boxxy.decision.recorded',
    'snapshotHash',
    ['snapshotHash'],
    {
      id: '0192f0c5-2b3c-7d4e-9f50-6a7b8c9d0e1f',
      attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
      item: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
      pool: 'build',
      rulesVersion: '60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752',
      storeVersion: 42,
      pepysOffsets: {},
      faults: [],
      at: 1_762_300_000_000,
    },
  ],
  ['boxxy.attempt.started', 'atcSession', ['atcSession'], {}],
  ['boxxy.attempt.reconciling', 'reason', ['reason'], {}],
  ['boxxy.attempt.reconciled', 'atcSession', ['atcSession'], {}],
  [
    'boxxy.attempt.session_bound',
    'agentSession',
    ['agentSession'],
    { atcSession: 'sess-01', seenAt: 1_762_300_000_000 },
  ],
  ['boxxy.attempt.closed_out', 'closeOut', ['closeOut'], {}],
  [
    'boxxy.attempt.settled',
    'failure',
    ['failure'],
    {
      state: 'failed',
      endedAt: 1_762_300_000_000,
      criteria: [],
      matched: [],
      frictionDropped: 0,
    },
  ],
  ['boxxy.evidence.recorded', 'ref', ['ref'], { kind: 'test', observed: '12 pass' }],
  ['boxxy.evidence.pr_linked', 'url', ['url'], { repo: 'acme/widgets', number: 41 }],
  ['boxxy.evidence.commit_linked', 'sha', ['sha'], { repo: 'acme/widgets', pr: 41 }],
  [
    'boxxy.pr.merged',
    'mergedAt',
    ['mergedAt'],
    {
      repo: 'acme/widgets',
      number: 41,
      mergeCommit: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
    },
  ],
  ['boxxy.pr.closed', 'number', ['number'], { repo: 'acme/widgets' }],
  ['boxxy.proposal.recorded', 'change', ['change'], { target: { kind: 'skill', name: 'testing' } }],
  ['boxxy.runner.paused', 'runner', ['runner'], {}],
  ['boxxy.runner.resumed', 'runner', ['runner'], {}],
] satisfies readonly (readonly [
  FactType,
  string,
  readonly string[],
  Readonly<Record<string, unknown>>,
])[])('it rejects a %s payload with no %s', (type, _field, path, payload) => {
  expect(factSchemas[type].safeParse(payload).error?.issues).toPartiallyContain({ path });
});

test('it accepts a decision fault from a filter field', () => {
  const fault: unknown = factSchemas['boxxy.decision.recorded'].safeParse({
    id: '0192f0c5-2b3c-7d4e-9f50-6a7b8c9d0e1f',
    attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
    item: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
    pool: 'build',
    rulesVersion: '60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752',
    snapshotHash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    storeVersion: 42,
    pepysOffsets: {},
    faults: [
      {
        plugin: 'area',
        kind: 'filter-field',
        item: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
        error: 'the area map has no entry',
      },
    ],
    at: 1_762_300_000_000,
  }).data?.faults;

  expect(fault).toStrictEqual([
    {
      plugin: 'area',
      kind: 'filter-field',
      item: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
      error: 'the area map has no entry',
    },
  ]);
});
