import { expect, test } from 'bun:test';
import { buildMockItemFacts } from '../test-utils/build-mock-item-facts.ts';
import { buildMockScopeFact } from '../test-utils/build-mock-scope-fact.ts';
import { foldWorkFacts } from './fold-work-facts.ts';
import type { WorkFact } from './types.ts';

test('it folds the facts of an item into its rows, its session rows and its links', () => {
  const scenario = buildMockItemFacts();
  const attempt = scenario.attempts;
  const fold = foldWorkFacts(scenario.facts);

  expect(fold.item).toStrictEqual({
    kind: 'core.issue',
    repo: 'shoal/charts',
    title: 'Chart the shoals',
    design_mode: null,
    filed_at: '2026-11-11T02:00:00.000Z',
    closed_at: null,
    close_reason: null,
    updated_at: '2026-11-11T02:00:00.000Z',
  });

  expect(
    fold.attempts.map((each) => [each.id, each.phase, each.state, each.outcome]),
  ).toStrictEqual([
    [attempt.triage, 'triage', 'succeeded', 'accepted'],
    [attempt.build, 'build', 'succeeded', 'built'],
    [attempt.review, 'review', 'succeeded', 'changes-requested'],
    [attempt.rebuild, 'build', 'succeeded', 'built'],
    [attempt.rereview, 'review', 'succeeded', 'passed'],
  ]);

  expect(fold.attempts[1]).toStrictEqual({
    id: attempt.build,
    phase: 'build',
    number: 1,
    round: 1,
    mode: 'agent',
    pool: 'main',
    recipe_hash: expect.any(String),
    rules_version: expect.any(String),
    atc_session: 's-build',
    state: 'succeeded',
    outcome: 'built',
    failure: null,
    claimed_at: '2026-11-11T02:10:00.000Z',
    started_at: '2026-11-11T02:10:05.000Z',
    closed_out_at: '2026-11-11T03:09:00.000Z',
    ended_at: '2026-11-11T03:10:00.000Z',
    sleeps: [{ from: '2026-11-11T02:30:00.000Z', to: '2026-11-11T02:50:00.000Z' }],
    updated_at: '2026-11-11T03:10:00.000Z',
    claimedFact: 'event:boxxy:f05',
    sessions: [
      {
        session: 'agent-7',
        key: 'agent',
        product: 'claude_code',
        caller_issuer: 'https://broker.example',
        caller_subject: 'imp-builder',
        bound_at: '2026-11-11T02:10:05.000Z',
        evidence: 'event:boxxy:f07',
      },
      {
        session: 's-build',
        key: 'atc',
        product: null,
        caller_issuer: 'https://broker.example',
        caller_subject: 'imp-builder',
        bound_at: '2026-11-11T02:10:05.000Z',
        evidence: 'event:boxxy:f06',
      },
    ],
    pullRequests: [{ id: '9001', evidence: 'event:boxxy:f08' }],
  });

  expect(fold.attempts[3]?.sessions).toStrictEqual([
    {
      session: 's-build',
      key: 'atc',
      product: null,
      caller_issuer: 'https://broker.example',
      caller_subject: 'imp-builder',
      bound_at: '2026-11-11T03:40:05.000Z',
      evidence: 'event:boxxy:f17',
    },
  ]);
});

test.each([
  ['reversed', (facts: WorkFact[]) => facts.toReversed()],
  [
    'with odd places first',
    (facts: WorkFact[]) => [
      ...facts.filter((_fact, index) => index % 2 === 1),
      ...facts.filter((_fact, index) => index % 2 === 0),
    ],
  ],
  ['rotated by seven', (facts: WorkFact[]) => [...facts.slice(7), ...facts.slice(0, 7)]],
  [
    'sorted by fact ID from the last',
    (facts: WorkFact[]) => facts.toSorted((left, right) => (left.id < right.id ? 1 : -1)),
  ],
])('it gives the same fold for the facts %s', (_order, reorder) => {
  const facts = buildMockItemFacts().facts;

  expect(foldWorkFacts(reorder(facts))).toStrictEqual(foldWorkFacts(facts));
});

test('it keeps the smaller fact ID as the evidence of a session that two facts with one time name', () => {
  const facts = [
    buildMockScopeFact('boxxy.attempt.claimed', {
      event: 'f2',
      at: '2026-11-11T02:10:00.000Z',
      payload: {
        attempt: '0193a1b2-0000-7000-8000-0000000000a2',
        phase: 'build',
        number: 1,
        round: 1,
      },
    }),
    buildMockScopeFact('boxxy.attempt.started', {
      event: 'f9',
      at: '2026-11-11T02:10:05.000Z',
      payload: {
        attempt: '0193a1b2-0000-7000-8000-0000000000a2',
        atcSession: 's-build',
        caller: { issuer: 'https://broker.example', subject: 'imp-builder' },
      },
    }),
    buildMockScopeFact('boxxy.attempt.session_bound', {
      event: 'f4',
      at: '2026-11-11T02:10:05.000Z',
      payload: {
        attempt: '0193a1b2-0000-7000-8000-0000000000a2',
        atcSession: 's-build',
        agentSession: 'agent-7',
      },
    }),
  ];

  const evidence = [facts, facts.toReversed()].map((order) =>
    foldWorkFacts(order).attempts[0]?.sessions.map((bound) => bound.evidence),
  );

  expect(evidence).toStrictEqual([
    ['event:boxxy:f4', 'event:boxxy:f4'],
    ['event:boxxy:f4', 'event:boxxy:f4'],
  ]);
});

test('it keeps one link and the smaller fact ID for a pull request that two facts with one time link', () => {
  const facts = [
    buildMockScopeFact('boxxy.attempt.claimed', {
      event: 'f1',
      at: '2026-11-11T02:10:00.000Z',
      payload: {
        attempt: '0193a1b2-0000-7000-8000-0000000000a2',
        phase: 'build',
        number: 1,
        round: 1,
      },
    }),
    buildMockScopeFact('boxxy.pull_request.linked', {
      event: 'f8-watch',
      at: '2026-11-11T02:25:00.000Z',
      payload: { attempt: '0193a1b2-0000-7000-8000-0000000000a2', pullRequestId: '9001' },
    }),
    buildMockScopeFact('boxxy.pull_request.linked', {
      event: 'f3-hook',
      at: '2026-11-11T02:25:00.000Z',
      payload: { attempt: '0193a1b2-0000-7000-8000-0000000000a2', pullRequestId: '9001' },
    }),
  ];

  const links = [facts, facts.toReversed()].map(
    (order) => foldWorkFacts(order).attempts[0]?.pullRequests,
  );

  expect(links).toStrictEqual([
    [{ id: '9001', evidence: 'event:boxxy:f3-hook' }],
    [{ id: '9001', evidence: 'event:boxxy:f3-hook' }],
  ]);
});

test('it takes the caller of the latest started, reconciled or resumed fact for every session row', () => {
  const later = { issuer: 'https://broker.example', subject: 'imp-waker' };

  const facts = [
    buildMockScopeFact('boxxy.attempt.claimed', {
      event: 'f1',
      at: '2026-11-11T02:10:00.000Z',
      payload: {
        attempt: '0193a1b2-0000-7000-8000-0000000000a2',
        phase: 'build',
        number: 1,
        round: 1,
      },
    }),
    buildMockScopeFact('boxxy.attempt.started', {
      event: 'f2',
      at: '2026-11-11T02:10:05.000Z',
      payload: {
        attempt: '0193a1b2-0000-7000-8000-0000000000a2',
        atcSession: 's-build',
        caller: { issuer: 'https://broker.example', subject: 'imp-builder' },
      },
    }),
    buildMockScopeFact('boxxy.attempt.resumed', {
      event: 'f3',
      at: '2026-11-11T03:00:00.000Z',
      payload: {
        attempt: '0193a1b2-0000-7000-8000-0000000000a2',
        atcSession: 's-build',
        caller: later,
      },
    }),
  ];

  const fold = foldWorkFacts(facts);

  expect(
    fold.attempts[0]?.sessions.map((bound) => [bound.caller_issuer, bound.caller_subject]),
  ).toStrictEqual([['https://broker.example', 'imp-waker']]);
});

test('it binds the atc row of a session that a remote target started to the ID after the last dot', () => {
  const facts = [
    buildMockScopeFact('boxxy.attempt.claimed', {
      event: 'f1',
      at: '2026-11-11T02:10:00.000Z',
      payload: {
        attempt: '0193a1b2-0000-7000-8000-0000000000a2',
        phase: 'build',
        number: 1,
        round: 1,
      },
    }),
    buildMockScopeFact('boxxy.attempt.started', {
      event: 'f2',
      at: '2026-11-11T02:10:05.000Z',
      payload: {
        attempt: '0193a1b2-0000-7000-8000-0000000000a2',
        atcSession: 'shoal-host.0c1d.s-build',
        caller: { issuer: 'https://broker.example', subject: 'imp-builder' },
      },
    }),
    buildMockScopeFact('boxxy.attempt.session_bound', {
      event: 'f3',
      at: '2026-11-11T02:10:06.000Z',
      payload: {
        attempt: '0193a1b2-0000-7000-8000-0000000000a2',
        atcSession: 'shoal-host.0c1d.s-build',
        agentSession: 'agent-7',
        product: 'claude_code',
      },
    }),
  ];

  const fold = foldWorkFacts(facts);

  expect(fold.attempts[0]?.sessions.map((bound) => [bound.key, bound.session])).toStrictEqual([
    ['agent', 'agent-7'],
    ['atc', 's-build'],
  ]);
});

test('it writes null caller columns for an attempt whose session facts carry no caller', () => {
  const facts = [
    buildMockScopeFact('boxxy.attempt.claimed', {
      event: 'f1',
      at: '2026-11-11T02:10:00.000Z',
      payload: {
        attempt: '0193a1b2-0000-7000-8000-0000000000a2',
        phase: 'build',
        number: 1,
        round: 1,
      },
    }),
    buildMockScopeFact('boxxy.attempt.reconciled', {
      event: 'f2',
      at: '2026-11-11T02:10:05.000Z',
      payload: {
        attempt: '0193a1b2-0000-7000-8000-0000000000a2',
        atcSession: 's-build',
        caller: null,
      },
    }),
  ];

  const fold = foldWorkFacts(facts);

  expect(
    fold.attempts[0]?.sessions.map((bound) => [bound.caller_issuer, bound.caller_subject]),
  ).toStrictEqual([[null, null]]);
});

test('it gives no attempt for facts whose claimed fact has not arrived', () => {
  const fold = foldWorkFacts([
    buildMockScopeFact('boxxy.attempt.started', {
      event: 'f3',
      at: '2026-11-11T02:01:05.000Z',
      payload: {
        attempt: '0193a1b2-0000-7000-8000-0000000000a1',
        atcSession: 's-triage',
        caller: { issuer: 'https://broker.example', subject: 'imp-builder' },
      },
    }),
  ]);

  expect(fold).toStrictEqual({ item: null, attempts: [] });
});

test('it lays the latest edit of each field and the close over the filed row', () => {
  const facts = [
    buildMockScopeFact('boxxy.item.edited', {
      event: 'f1',
      at: '2026-11-11T01:59:00.000Z',
      payload: { title: 'An edit before the filed fact' },
    }),
    buildMockScopeFact('boxxy.item.filed', {
      event: 'f2',
      at: '2026-11-11T02:00:00.000Z',
      payload: {
        kind: 'core.issue',
        title: 'Chart the shoals',
        repo: 'shoal/charts',
        fields: { designMode: 'agent' },
      },
    }),
    buildMockScopeFact('boxxy.item.edited', {
      event: 'f3',
      at: '2026-11-11T02:30:00.000Z',
      payload: { title: 'Chart the reefs', fields: { designMode: 'attended' } },
    }),
    buildMockScopeFact('boxxy.item.closed', {
      event: 'f4',
      at: '2026-11-11T05:00:00.000Z',
      payload: { reason: 'done' },
    }),
  ];

  const fold = foldWorkFacts(facts.toReversed());

  expect(fold.item).toStrictEqual({
    kind: 'core.issue',
    repo: 'shoal/charts',
    title: 'Chart the reefs',
    design_mode: 'attended',
    filed_at: '2026-11-11T02:00:00.000Z',
    closed_at: '2026-11-11T05:00:00.000Z',
    close_reason: 'done',
    updated_at: '2026-11-11T05:00:00.000Z',
  });
});

test('it ends the last sleep at the settle of an attempt that settled asleep, and leaves an open sleep open', () => {
  const design = '0193a1b2-0000-7000-8000-0000000000c1';

  const facts = [
    buildMockScopeFact('boxxy.attempt.claimed', {
      event: 'f1',
      at: '2026-11-11T02:00:00.000Z',
      payload: { attempt: design, phase: 'design', number: 1, round: 1 },
    }),
    buildMockScopeFact('boxxy.attempt.slept', {
      event: 'f2',
      at: '2026-11-11T02:10:00.000Z',
      payload: { attempt: design },
    }),
    buildMockScopeFact('boxxy.attempt.woken', {
      event: 'f3',
      at: '2026-11-11T02:20:00.000Z',
      payload: { attempt: design },
    }),
    buildMockScopeFact('boxxy.attempt.slept', {
      event: 'f4',
      at: '2026-11-11T03:00:00.000Z',
      payload: { attempt: design },
    }),
    buildMockScopeFact('boxxy.attempt.settled', {
      event: 'f5',
      at: '2026-11-11T03:30:00.000Z',
      payload: {
        attempt: design,
        state: 'failed',
        outcome: 'lost',
        failure: 'item-closed',
        asleep: true,
      },
    }),
    buildMockScopeFact('boxxy.attempt.claimed', {
      event: 'f6',
      at: '2026-11-11T04:00:00.000Z',
      payload: {
        attempt: '0193a1b2-0000-7000-8000-0000000000a2',
        phase: 'build',
        number: 2,
        round: 1,
      },
    }),
    buildMockScopeFact('boxxy.attempt.slept', {
      event: 'f7',
      at: '2026-11-11T04:10:00.000Z',
      payload: { attempt: '0193a1b2-0000-7000-8000-0000000000a2' },
    }),
  ];

  const sleeps = foldWorkFacts(facts.toReversed()).attempts.map((each) => each.sleeps);

  expect(sleeps).toStrictEqual([
    [{ from: '2026-11-11T04:10:00.000Z', to: null }],
    [
      { from: '2026-11-11T02:10:00.000Z', to: '2026-11-11T02:20:00.000Z' },
      { from: '2026-11-11T03:00:00.000Z', to: '2026-11-11T03:30:00.000Z' },
    ],
  ]);
});
