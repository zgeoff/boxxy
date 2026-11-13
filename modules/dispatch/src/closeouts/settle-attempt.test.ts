import { expect, test } from 'bun:test';
import type { AttemptRow, Edge, Effect, ForcedFailure, ItemId, LoadedRules } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockPhaseKind } from '@boxxy/model/test-utils/build-mock-phase-kind';
import { createFakeNotifier } from '@boxxy/model/test-utils/create-fake-notifier';
import invariant from 'tiny-invariant';
import { sendNotices } from '../notices/send-notices.ts';
import { buildMockRelationChange } from '../test-utils/build-mock-relation-change.ts';
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
        tx.listOpenItems(
          brandSchemas.repoName.parse('example/app'),
          [brandSchemas.itemKindName.parse('core.issue')],
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

test('it blocks an accepted item on the item a triage relation names as its source', async () => {
  const ctx = await setupTest();
  const other = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('build') });
  const attempt = await ctx.claimAt('triage');

  await ctx.closeOut(attempt, {
    result: { kind: 'accepted' },
    relations: [{ type: 'blocks', source: other }],
    friction: [],
  });

  await ctx.settle(attempt);

  const detail = await ctx.readItem(attempt.item);

  const received: unknown = [detail.item.derived, detail.relations];

  expect(received).toStrictEqual([
    { state: 'blocked' },
    [expect.objectContaining({ source: other, target: attempt.item, type: 'blocks' })],
  ]);
});

test('it readies an item that waits on another once that item closes', async () => {
  const ctx = await setupTest();
  const other = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('build') });
  const attempt = await ctx.claimAt('triage');

  await ctx.closeOut(attempt, {
    result: { kind: 'accepted' },
    relations: [{ type: 'blocks', source: other }],
    friction: [],
  });

  await ctx.settle(attempt);
  await ctx.closeItem(other, 'done elsewhere');

  const detail = await ctx.readItem(attempt.item);

  const received: unknown = [detail.item.derived, detail.relations];

  expect(received).toStrictEqual([
    { state: 'ready' },
    [expect.objectContaining({ source: other, target: attempt.item, type: 'blocks' })],
  ]);
});

test('it adds a wait on another item when the rules hold the accepted item', async () => {
  const ctx = await setupTest();
  const other = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('build') });
  const attempt = await ctx.claimAt('triage');

  ctx.setRules(
    ctx.mapOutcome(ctx.rules(), 'triage', 'accepted', {
      hold: brandSchemas.rulesHoldReason.parse('accepted'),
    }),
  );

  await ctx.closeOut(attempt, {
    result: { kind: 'accepted' },
    relations: [{ type: 'blocks', source: other }],
    friction: [],
  });

  await ctx.settle(attempt);

  const detail = await ctx.readItem(attempt.item);
  const [settled] = await ctx.listFacts('boxxy.attempt.settled');

  const received: unknown = detail.relations;

  expect(received).toStrictEqual([
    expect.objectContaining({ source: other, target: attempt.item, type: 'blocks' }),
  ]);

  expect(settled?.payload).toMatchObject({ skippedEffects: [] });
});

test('it adds no other relation when the rules hold the accepted item', async () => {
  const ctx = await setupTest();
  const other = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('build') });
  const attempt = await ctx.claimAt('triage');

  ctx.setRules(
    ctx.mapOutcome(ctx.rules(), 'triage', 'accepted', {
      hold: brandSchemas.rulesHoldReason.parse('accepted'),
    }),
  );

  await ctx.closeOut(attempt, {
    result: { kind: 'accepted' },
    relations: [
      { type: 'blocks', target: other },
      { type: 'relates-to', source: other },
    ],
    friction: [],
  });

  await ctx.settle(attempt);

  const detail = await ctx.readItem(attempt.item);
  const [settled] = await ctx.listFacts('boxxy.attempt.settled');

  expect(detail.relations).toStrictEqual([]);

  expect(settled?.payload).toMatchObject({
    skippedEffects: [
      { effect: 'add-relation', reason: 'the item holds for the owner' },
      { effect: 'add-relation', reason: 'the item holds for the owner' },
    ],
  });
});

test('it skips a relation from another item that is live already, and still settles', async () => {
  const ctx = await setupTest();
  const other = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('build') });
  const attempt = await ctx.claimAt('triage');

  await ctx.store.exclusive((tx) =>
    tx.applyChange(buildMockRelationChange({ source: other, target: attempt.item })),
  );

  await ctx.closeOut(attempt, {
    result: { kind: 'accepted' },
    relations: [{ type: 'blocks', source: other }],
    friction: [],
  });

  const result = await ctx.settle(attempt);
  const [settled] = await ctx.listFacts('boxxy.attempt.settled');

  expect(result).toStrictEqual({ kind: 'applied' });

  expect(settled?.payload).toMatchObject({
    skippedEffects: [{ effect: 'add-relation', reason: 'the relation is live already' }],
  });
});

test('it skips a relation from another item that the item already relates to the same way', async () => {
  const ctx = await setupTest();
  const other = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('build') });
  const attempt = await ctx.claimAt('triage');

  await ctx.store.exclusive((tx) =>
    tx.applyChange(buildMockRelationChange({ source: attempt.item, target: other })),
  );

  await ctx.closeOut(attempt, {
    result: { kind: 'accepted' },
    relations: [{ type: 'blocks', source: other }],
    friction: [],
  });

  await ctx.settle(attempt);

  const detail = await ctx.readItem(attempt.item);
  const [settled] = await ctx.listFacts('boxxy.attempt.settled');

  const received: unknown = [detail.item.derived, detail.relations.length];

  expect(received).toStrictEqual([{ state: 'ready' }, 1]);

  expect(settled?.payload).toMatchObject({
    skippedEffects: [
      { effect: 'add-relation', reason: 'the relation would close a loop of blocks relations' },
    ],
  });
});

test('it skips a wait on another item that would close a longer loop of blocks relations', async () => {
  const ctx = await setupTest();
  const first = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('build') });
  const second = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('build') });
  const attempt = await ctx.claimAt('triage');

  await ctx.store.exclusive((tx) =>
    tx.applyChange(buildMockRelationChange({ source: attempt.item, target: first })),
  );

  await ctx.store.exclusive((tx) =>
    tx.applyChange(buildMockRelationChange({ source: first, target: second })),
  );

  await ctx.closeOut(attempt, {
    result: { kind: 'accepted' },
    relations: [{ type: 'blocks', source: second }],
    friction: [],
  });

  await ctx.settle(attempt);

  const detail = await ctx.readItem(attempt.item);
  const [settled] = await ctx.listFacts('boxxy.attempt.settled');

  const received: unknown = [detail.item.derived, detail.relations.length];

  expect(received).toStrictEqual([{ state: 'ready' }, 1]);

  expect(settled?.payload).toMatchObject({
    skippedEffects: [
      { effect: 'add-relation', reason: 'the relation would close a loop of blocks relations' },
    ],
  });
});

test('it adds a duplicate-of relation that points back at a live one', async () => {
  const ctx = await setupTest();
  const other = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('build') });
  const attempt = await ctx.claimAt('triage');

  const duplicateOf = brandSchemas.relationTypeName.parse('duplicate-of');

  await ctx.store.exclusive((tx) =>
    tx.applyChange(
      buildMockRelationChange({ source: other, target: attempt.item, type: duplicateOf }),
    ),
  );

  await ctx.closeOut(attempt, {
    result: { kind: 'accepted' },
    relations: [{ type: 'duplicate-of', target: other }],
    friction: [],
  });

  await ctx.settle(attempt);

  const detail = await ctx.readItem(attempt.item);
  const [settled] = await ctx.listFacts('boxxy.attempt.settled');

  expect(detail.relations.map((relation) => [relation.source, relation.target])).toStrictEqual([
    [other, attempt.item],
    [attempt.item, other],
  ]);

  expect(settled?.payload).toMatchObject({ skippedEffects: [] });
});

test('it makes the item of a blocked design wait on the item its close-out names', async () => {
  const ctx = await setupTest();
  const other = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('build') });
  const attempt = await ctx.claimAt('design');

  await ctx.closeOut(attempt, {
    result: {
      kind: 'blocked',
      reason: 'The theme needs the settings page first.',
      relations: [{ type: 'blocks', source: other }],
    },
    friction: [],
  });

  await ctx.settle(attempt);

  const detail = await ctx.readItem(attempt.item);

  const received: unknown = detail.relations;

  expect(received).toStrictEqual([
    expect.objectContaining({ source: other, target: attempt.item, type: 'blocks' }),
  ]);
});

test('it makes the item of a designed close-out wait on the item it names', async () => {
  const ctx = await setupTest();
  const other = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('build') });
  const attempt = await ctx.claimAt('design');

  await ctx.closeOut(attempt, {
    result: {
      kind: 'designed',
      design: { text: 'Follow the system theme.', location: null },
      relations: [{ type: 'blocks', source: other }],
    },
    friction: [],
  });

  await ctx.settle(attempt);

  const detail = await ctx.readItem(attempt.item);

  const received: unknown = [detail.item.derived, detail.relations];

  expect(received).toStrictEqual([
    { state: 'blocked' },
    [expect.objectContaining({ source: other, target: attempt.item, type: 'blocks' })],
  ]);
});

test('it makes the item of a blocked build wait on the item its close-out names', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAt('build');
  const other = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('design') });

  await ctx.closeOut(attempt, {
    result: { kind: 'blocked', reason: 'The settings page must land first.' },
    criteria: [],
    openItems: [],
    relations: [{ type: 'blocks', source: other }],
    friction: [],
  });

  await ctx.settle(attempt);

  const detail = await ctx.readItem(attempt.item);

  const received: unknown = detail.relations;

  expect(received).toStrictEqual([
    expect.objectContaining({ source: other, target: attempt.item, type: 'blocks' }),
  ]);
});

test('it files an open item as the kind it names, with the security mark it sets', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAt('design');

  await ctx.closeOut(attempt, {
    result: {
      kind: 'designed',
      design: { text: 'Follow the system theme.', location: null },
      openItems: [
        { kind: 'core.idea', title: 'Escape the theme name', body: 'Found.', security: true },
      ],
    },
    friction: [],
  });

  await ctx.settle(attempt);

  const filed = await ctx.listFacts('boxxy.item.filed');

  expect(filed.map((fact) => fact.payload)).toMatchObject([
    { kind: 'core.issue', fields: {} },
    { kind: 'core.idea', title: 'Escape the theme name', fields: { security: true } },
  ]);
});

test('it files an open item whose title matches an open item of another kind', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAt('design');
  const [existing] = await ctx.listOpenIssues();

  invariant(existing !== undefined, 'the design item is an open issue');

  await ctx.closeOut(attempt, {
    result: {
      kind: 'designed',
      design: { text: 'Follow the system theme.', location: null },
      openItems: [{ kind: 'core.idea', title: existing.title, body: 'Found while designing.' }],
    },
    friction: [],
  });

  await ctx.settle(attempt);

  const [settled] = await ctx.listFacts('boxxy.attempt.settled');
  const filed = await ctx.listFacts('boxxy.item.filed');

  expect(settled?.payload).toMatchObject({ matched: [] });

  expect(filed.map((fact) => fact.payload)).toMatchObject([
    { kind: 'core.issue' },
    { kind: 'core.idea', title: existing.title },
  ]);
});

test('it rejects a close-out that files an open item of a kind the rules lack', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAt('design');

  const answer = await ctx.closeOut(attempt, {
    result: {
      kind: 'designed',
      design: { text: 'Follow the system theme.', location: null },
      openItems: [{ kind: 'core.epic', title: 'Theme every screen', body: 'Found.' }],
    },
    friction: [],
  });

  expect(answer).toStrictEqual({
    kind: 'rejected',
    problems: [{ kind: 'unknown-kind', itemKind: 'core.epic' }],
  });
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

test('it files a part of a split triage that has the title of the item it closes', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAt('triage');

  await ctx.closeOut(attempt, {
    result: {
      kind: 'split',
      openItems: [{ kind: 'core.issue', title: 'Add a dark theme', body: 'The theme toggle.' }],
    },
    relations: [],
    friction: [],
  });

  await ctx.settle(attempt);

  const filed = await ctx.listFacts('boxxy.item.filed');

  expect(filed.map((fact) => fact.payload)).toMatchObject([
    {},
    { title: 'Add a dark theme', foundInAttempt: attempt.id },
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
      { effect: 'add-relation', reason: 'the relation is live already' },
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
