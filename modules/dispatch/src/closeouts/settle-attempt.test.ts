import { expect, test } from 'bun:test';
import type { AttemptRow, Edge, Effect, ForcedFailure, ItemId, LoadedRules } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockPhaseKind } from '@boxxy/model/test-utils/build-mock-phase-kind';
import { createFakeNotifier } from '@boxxy/model/test-utils/create-fake-notifier';
import invariant from 'tiny-invariant';
import { sendNotices } from '../notices/send-notices.ts';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { closeOutAttempt } from './close-out-attempt.ts';
import { settleAttempt } from './settle-attempt.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  return {
    ...dispatch,
    claimAt: async (phase: string) => {
      const item = await dispatch.seedItem({ phase: brandSchemas.phaseName.parse(phase) });
      const claim = await dispatch.claim();

      invariant(claim?.attempt.item === item, `the claim picks the seeded ${phase} item`);

      return dispatch.readAttempt(claim.attempt.id);
    },
    closeOut: (attempt: AttemptRow, body: unknown) =>
      closeOutAttempt({
        store: dispatch.store,
        call: dispatch.buildCallRef(attempt),
        body,
        rules: dispatch.rules(),
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      }),
    settle: (attempt: AttemptRow, forced: ForcedFailure | null = null) =>
      settleAttempt({
        store: dispatch.store,
        attempt: attempt.id,
        forced,
        sessionStopped: true,
        rules: dispatch.rules(),
        actor: 'boxxy:runner:runner-1',
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      }),
    readItem: async (item: ItemId) => {
      const detail = await dispatch.store.read((tx) =>
        tx.readItemDetail(item, dispatch.clock.now(), dispatch.rules()),
      );

      invariant(detail !== null, 'the item is stored');

      return detail;
    },
    listNotices: () => dispatch.store.read((tx) => tx.listUnsentNotices(10)),
    listOpenIssues: () =>
      dispatch.store.read((tx) =>
        tx.listOpenIssues(
          brandSchemas.repoName.parse('example/app'),
          dispatch.clock.now(),
          dispatch.rules(),
        ),
      ),
    mapOutcome: (rules: LoadedRules, phase: string, outcome: string, edge: Edge): LoadedRules => ({
      ...rules,
      kinds: new Map(
        [...rules.kinds].map(([name, kind]) => [
          name,
          {
            ...kind,
            pipeline: {
              ...kind.pipeline,
              steps: kind.pipeline.steps.map((step) =>
                step.phase === phase ? { ...step, on: { ...step.on, [outcome]: edge } } : step,
              ),
            },
          },
        ]),
      ),
    }),
  };
}

test('it settles a forced cause as failed and lost, whatever the close-out says', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAt('triage');

  await ctx.closeOut(attempt, { result: { kind: 'accepted' }, relations: [], friction: [] });

  const result = await ctx.settle(attempt, 'timed-out');
  const after = await ctx.readAttempt(attempt.id);

  expect(result).toStrictEqual({ kind: 'applied' });

  expect([after.state, after.failure, after.outcome]).toStrictEqual([
    'failed',
    'timed-out',
    'lost',
  ]);
});

test('it settles an attempt with no close-out as closeout-missing', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAt('triage');

  await ctx.settle(attempt);

  const after = await ctx.readAttempt(attempt.id);

  expect([after.state, after.failure, after.outcome]).toStrictEqual([
    'failed',
    'closeout-missing',
    'lost',
  ]);
});

test('it applies the item changes of an accepted triage in the settle change', async () => {
  const ctx = await setupTest();
  const other = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('build') });
  const attempt = await ctx.claimAt('triage');

  await ctx.closeOut(attempt, {
    result: { kind: 'accepted' },
    set: { designMode: 'attended', acceptance: [{ text: 'The app reads dark at night.' }] },
    relations: [{ type: 'relates-to', target: other }],
    friction: [{ target: { kind: 'skill', name: 'testing' }, change: 'Name the clock helper.' }],
  });

  await ctx.settle(attempt);

  const detail = await ctx.readItem(attempt.item);
  const proposals = await ctx.listFacts('boxxy.proposal.recorded');

  const received: unknown = [
    detail.item.fields,
    detail.item.acceptance.map((criterion) => criterion.text),
    detail.relations.map((relation) => [relation.target, relation.type]),
    proposals.length,
  ];

  expect(received).toStrictEqual([
    { designMode: 'attended' },
    ['The app reads dark at night.'],
    [[other, 'relates-to']],
    1,
  ]);
});

test('it replaces the item body with the body of an accepted triage and records the edit', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAt('triage');

  await ctx.closeOut(attempt, {
    result: { kind: 'accepted' },
    set: { body: '## Scope\n\nThe dark theme only.' },
    relations: [],
    friction: [],
  });

  await ctx.settle(attempt);

  const detail = await ctx.readItem(attempt.item);
  const edited = await ctx.listFacts('boxxy.item.edited');

  expect(detail.item.body).toBe('## Scope\n\nThe dark theme only.');

  expect(edited.map((fact) => [fact.entity, fact.payload])).toStrictEqual([
    [
      `boxxy:item:${attempt.item}`,
      { body: '## Scope\n\nThe dark theme only.', byAttempt: attempt.id },
    ],
  ]);
});

test('it keeps the item body when the triage outcome holds the item', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAt('triage');

  await ctx.closeOut(attempt, {
    result: { kind: 'declined', reason: 'Out of scope.' },
    set: { body: 'A body the owner never saw.' },
    relations: [],
    friction: [],
  });

  await ctx.settle(attempt);

  const detail = await ctx.readItem(attempt.item);
  const [settled] = await ctx.listFacts('boxxy.attempt.settled');

  expect(detail.item.body).toBe('');

  expect(settled?.payload).toMatchObject({
    skippedEffects: expect.arrayContaining([
      { effect: 'set-body', reason: 'the item holds for the owner' },
    ]),
  });
});

test('it replaces the acceptance list with the list of a designed close-out and records the edit', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAt('design');

  await ctx.closeOut(attempt, {
    result: {
      kind: 'designed',
      design: { text: 'Follow the system theme.', location: null },
      set: { acceptance: [{ text: 'The app reads dark at night.' }] },
    },
    friction: [],
  });

  await ctx.settle(attempt);

  const detail = await ctx.readItem(attempt.item);
  const edited = await ctx.listFacts('boxxy.item.edited');

  const criteria = [{ id: 'a1', text: 'The app reads dark at night.', evidence: [] }];
  const received: unknown = detail.item.acceptance;

  expect(received).toStrictEqual(criteria);

  expect(edited.map((fact) => [fact.entity, fact.payload])).toStrictEqual([
    [`boxxy:item:${attempt.item}`, { acceptance: criteria, byAttempt: attempt.id }],
  ]);
});

test('it files each new open item of a designed close-out once and lists the open issue that a title matches', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAt('design');
  const [existing] = await ctx.listOpenIssues();

  invariant(existing !== undefined, 'the design item is an open issue');

  await ctx.closeOut(attempt, {
    result: {
      kind: 'designed',
      design: { text: 'Follow the system theme.', location: null },
      openItems: [
        { kind: 'core.issue', title: '  ADD a dark   theme ', body: 'Found while designing.' },
        { kind: 'core.issue', title: 'Cache the theme', body: 'Found while designing.' },
        { kind: 'core.issue', title: 'cache the theme', body: 'Found again.' },
      ],
    },
    friction: [],
  });

  await ctx.settle(attempt);

  const [settled] = await ctx.listFacts('boxxy.attempt.settled');
  const filed = await ctx.listFacts('boxxy.item.filed');

  expect(settled?.payload).toMatchObject({
    matched: [existing.id],
    skippedEffects: [{ effect: 'file-item', reason: 'the close-out names this title already' }],
  });

  expect(filed.map((fact) => fact.payload)).toMatchObject([
    {},
    { title: 'Cache the theme', foundInAttempt: attempt.id, acceptance: [] },
  ]);
});

test('it keeps the acceptance list, and still files the open items, when the rules hold a designed item', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAt('design');

  ctx.setRules(
    ctx.mapOutcome(ctx.rules(), 'design', 'designed', {
      hold: brandSchemas.rulesHoldReason.parse('designed'),
    }),
  );

  await ctx.closeOut(attempt, {
    result: {
      kind: 'designed',
      design: { text: 'Follow the system theme.', location: null },
      set: { acceptance: [{ text: 'A list the owner never saw.' }] },
      openItems: [{ kind: 'core.issue', title: 'Cache the theme', body: 'Found.' }],
    },
    friction: [],
  });

  await ctx.settle(attempt);

  const detail = await ctx.readItem(attempt.item);
  const [settled] = await ctx.listFacts('boxxy.attempt.settled');
  const filed = await ctx.listFacts('boxxy.item.filed');

  expect(detail.item.acceptance.map((criterion) => criterion.text)).toStrictEqual([
    'The app reads dark when the system does.',
  ]);

  expect(settled?.payload).toMatchObject({
    skippedEffects: [{ effect: 'set-acceptance', reason: 'the item holds for the owner' }],
  });

  expect(filed.map((fact) => fact.payload)).toMatchObject([{}, { title: 'Cache the theme' }]);
});

test('it withholds the close of a declined triage, holds the item, and writes the notice', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAt('triage');

  await ctx.closeOut(attempt, {
    result: { kind: 'declined', reason: 'Out of scope.' },
    relations: [],
    friction: [],
  });

  await ctx.settle(attempt);

  const detail = await ctx.readItem(attempt.item);
  const [settled] = await ctx.listFacts('boxxy.attempt.settled');
  const notices = await ctx.listNotices();

  const position = detail.item.position;

  invariant(position.kind === 'hold', 'the declined item holds');

  const received: unknown = [detail.item.closedAt, position.reason, position.then, position.round];

  expect(received).toStrictEqual([null, 'declined', 'triage', 2]);

  expect(settled?.payload).toMatchObject({
    skippedEffects: [{ effect: 'close-item', reason: 'the item holds for the owner' }],
  });

  expect(notices).toMatchObject([{ item: attempt.item, reason: 'declined', tries: 0 }]);
});

test('it holds a triage that needs the owner open at triage, and writes the notice', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAt('triage');

  await ctx.closeOut(attempt, {
    result: { kind: 'needs-owner', question: 'Should the export cover archived projects?' },
    relations: [],
    friction: [],
  });

  await ctx.settle(attempt);

  const detail = await ctx.readItem(attempt.item);
  const notices = await ctx.listNotices();

  const position = detail.item.position;

  invariant(position.kind === 'hold', 'the item holds');

  const received: unknown = [detail.item.closedAt, position.reason, position.then];

  expect(received).toStrictEqual([null, 'needs-owner', 'triage']);
  expect(notices).toMatchObject([{ item: attempt.item, reason: 'needs-owner', tries: 0 }]);
});

test('it files each part of a split triage and closes the item when the rules end the split', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAt('triage');

  await ctx.closeOut(attempt, {
    result: {
      kind: 'split',
      openItems: [
        { kind: 'core.issue', title: 'Export projects as CSV', body: 'One part of the export.' },
        { kind: 'core.issue', title: 'Export projects as JSON', body: 'The other part.' },
      ],
    },
    relations: [],
    friction: [],
  });

  await ctx.settle(attempt);

  const detail = await ctx.readItem(attempt.item);
  const filed = await ctx.listFacts('boxxy.item.filed');

  const received: unknown = [detail.item.closeReason, detail.item.position];

  expect(received).toStrictEqual(['split', { kind: 'end', reason: 'split' }]);

  expect(filed.map((fact) => fact.payload)).toMatchObject([
    {},
    { title: 'Export projects as CSV', foundInAttempt: attempt.id },
    { title: 'Export projects as JSON', foundInAttempt: attempt.id },
  ]);
});

test('it still files the parts of a split triage, and keeps the item open, when the rules hold the split', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAt('triage');

  ctx.setRules(
    ctx.mapOutcome(ctx.rules(), 'triage', 'split', {
      hold: brandSchemas.rulesHoldReason.parse('split'),
    }),
  );

  await ctx.closeOut(attempt, {
    result: {
      kind: 'split',
      openItems: [{ kind: 'core.issue', title: 'Export projects as CSV', body: 'One part.' }],
    },
    relations: [],
    friction: [],
  });

  await ctx.settle(attempt);

  const detail = await ctx.readItem(attempt.item);
  const filed = await ctx.listFacts('boxxy.item.filed');

  expect(detail.item.closedAt).toBeNull();

  expect(filed.map((fact) => fact.payload)).toMatchObject([
    {},
    { title: 'Export projects as CSV' },
  ]);
});

test('it leaves the attempt and the item as they were when the notice of its hold is refused 6 times', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAt('triage');

  const notifier = createFakeNotifier();

  await ctx.closeOut(attempt, {
    result: { kind: 'declined', reason: 'Out of scope.' },
    relations: [],
    friction: [],
  });

  await ctx.settle(attempt);

  const before = [await ctx.readAttempt(attempt.id), await ctx.readItem(attempt.item)];

  notifier.failAlways({ kind: 'refused', reason: 'session_dead' });

  for (let tick = 0; tick < 6; tick += 1) {
    await sendNotices({ store: ctx.store, notifier, now: ctx.clock.now() });

    ctx.clock.advance(900_000);
  }

  const after = [await ctx.readAttempt(attempt.id), await ctx.readItem(attempt.item)];

  const notices = await ctx.listNotices();

  expect(after).toStrictEqual(before);
  expect(notices).toMatchObject([{ item: attempt.item, tries: 6, sentAt: null }]);
});

test('it closes a duplicate and adds the relation when the rules end the outcome', async () => {
  const ctx = await setupTest();
  const other = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('build') });
  const attempt = await ctx.claimAt('triage');

  ctx.setRules(ctx.mapOutcome(ctx.rules(), 'triage', 'duplicate', { end: 'duplicate' }));

  await ctx.closeOut(attempt, {
    result: { kind: 'duplicate', of: other },
    relations: [],
    friction: [],
  });

  await ctx.settle(attempt);

  const detail = await ctx.readItem(attempt.item);
  const notices = await ctx.listNotices();

  const received: unknown = [
    detail.item.closeReason,
    detail.relations.map((relation) => [relation.target, relation.type]),
    notices,
  ];

  expect(received).toStrictEqual(['duplicate', [[other, 'duplicate-of']], []]);
});

test('it settles a stored close-out whose effects repeat a relation and a close, and lists each skip', async () => {
  const ctx = await setupTest();
  const other = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('build') });
  const attempt = await ctx.claimAt('triage');

  const rules = ctx.rules();
  const relatesTo = brandSchemas.relationTypeName.parse('relates-to');
  const duplicateOf = brandSchemas.relationTypeName.parse('duplicate-of');

  const effects: Effect[] = [
    { kind: 'add-relation', relation: { type: relatesTo, target: other } },
    { kind: 'add-relation', relation: { type: relatesTo, target: other } },
    { kind: 'add-relation', relation: { type: duplicateOf, target: other } },
    { kind: 'add-relation', relation: { type: relatesTo, target: attempt.item } },
    { kind: 'close-item', reason: 'duplicate', of: other },
    { kind: 'close-item', reason: 'Not wanted', of: null },
  ];

  await ctx.closeOut(attempt, { result: { kind: 'accepted' }, relations: [], friction: [] });

  ctx.setRules({
    ...rules,
    phases: new Map([
      ...rules.phases,
      [
        brandSchemas.phaseName.parse('triage'),
        {
          ...buildMockPhaseKind({ name: 'triage', outcomes: ['accepted'] }),
          settle: () => ({
            state: 'succeeded',
            failure: null,
            outcome: 'accepted',
            effects,
            frictionDropped: 0,
          }),
        },
      ],
    ]),
  });

  const result = await ctx.settle(attempt);
  const detail = await ctx.readItem(attempt.item);
  const [settled] = await ctx.listFacts('boxxy.attempt.settled');

  expect(result).toStrictEqual({ kind: 'applied' });

  expect(detail.relations.map((relation) => [relation.type, relation.target])).toStrictEqual([
    [relatesTo, other],
    [duplicateOf, other],
  ]);

  expect(settled?.payload).toMatchObject({
    skippedEffects: [
      { effect: 'add-relation', reason: 'the relation is live already' },
      { effect: 'add-relation', reason: 'an item has no relation to itself' },
      { effect: 'close-item', reason: 'the item is closed' },
    ],
  });
});

test('it files each new open item once and lists the open issue that a title matches', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAt('build');
  const [existing] = await ctx.listOpenIssues();

  invariant(existing !== undefined, 'the build item is an open issue');

  await ctx.closeOut(attempt, {
    result: { kind: 'blocked', reason: 'The theme needs a decision.' },
    criteria: [],
    openItems: [
      { kind: 'core.issue', title: '  ADD a dark   theme ', body: 'Found while building.' },
      { kind: 'core.issue', title: 'Cache the theme', body: 'Found while building.' },
      { kind: 'core.issue', title: 'cache the theme', body: 'Found while building.' },
    ],
    friction: [],
  });

  await ctx.settle(attempt);

  const [settled] = await ctx.listFacts('boxxy.attempt.settled');
  const filed = await ctx.listFacts('boxxy.item.filed');

  expect(settled?.payload).toMatchObject({ matched: [existing.id] });

  expect(filed.map((fact) => fact.payload)).toMatchObject([
    {},
    { title: 'Cache the theme', foundInAttempt: attempt.id, acceptance: [] },
  ]);
});

test('it lists an open item whose title the close-out repeats as a skipped effect', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAt('build');

  await ctx.closeOut(attempt, {
    result: { kind: 'blocked', reason: 'The theme needs a decision.' },
    criteria: [],
    openItems: [
      { kind: 'core.issue', title: 'Cache the theme', body: 'Found while building.' },
      { kind: 'core.issue', title: 'cache the theme', body: 'Found again.' },
    ],
    friction: [],
  });

  await ctx.settle(attempt);

  const [settled] = await ctx.listFacts('boxxy.attempt.settled');

  expect(settled?.payload).toMatchObject({
    matched: [],
    skippedEffects: [{ effect: 'file-item', reason: 'the close-out names this title already' }],
  });
});

test('it settles as unsettleable, and keeps the returned name apart, when the phase code answers an unlisted outcome', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAt('triage');

  const rules = ctx.rules();

  await ctx.closeOut(attempt, { result: { kind: 'accepted' }, relations: [], friction: [] });

  ctx.setRules({
    ...rules,
    phases: new Map([
      ...rules.phases,
      [
        brandSchemas.phaseName.parse('triage'),
        {
          ...buildMockPhaseKind({ name: 'triage', outcomes: ['accepted'] }),
          settle: () => ({
            state: 'succeeded',
            failure: null,
            outcome: 'approved',
            effects: [],
            frictionDropped: 0,
          }),
        },
      ],
    ]),
  });

  await ctx.settle(attempt);

  const after = await ctx.readAttempt(attempt.id);

  expect([after.failure, after.outcome, after.returnedOutcome]).toStrictEqual([
    'closeout-unsettleable',
    'unsettleable',
    'approved',
  ]);
});
