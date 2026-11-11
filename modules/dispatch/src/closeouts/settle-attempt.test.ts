import { expect, test } from 'bun:test';
import type { AttemptRow, Edge, ForcedFailure, ItemId, LoadedRules } from '@boxxy/model';
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
    mapTriageOutcome: (rules: LoadedRules, outcome: string, edge: Edge): LoadedRules => ({
      ...rules,
      kinds: new Map(
        [...rules.kinds].map(([name, kind]) => [
          name,
          {
            ...kind,
            pipeline: {
              ...kind.pipeline,
              steps: kind.pipeline.steps.map((step) =>
                step.phase === 'triage' ? { ...step, on: { ...step.on, [outcome]: edge } } : step,
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

test('it leaves the attempt and the item as they were when the notice of its hold fails 5 times', async () => {
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

  notifier.failAlways('session offline');

  for (let tick = 0; tick < 6; tick += 1) {
    await sendNotices({ store: ctx.store, notifier, now: ctx.clock.now() });
  }

  const after = [await ctx.readAttempt(attempt.id), await ctx.readItem(attempt.item)];

  const notices = await ctx.listNotices();

  expect(after).toStrictEqual(before);
  expect(notices).toMatchObject([{ item: attempt.item, tries: 5, sentAt: null }]);
});

test('it closes a duplicate and adds the relation when the rules end the outcome', async () => {
  const ctx = await setupTest();
  const other = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('build') });
  const attempt = await ctx.claimAt('triage');

  ctx.setRules(ctx.mapTriageOutcome(ctx.rules(), 'duplicate', { end: 'duplicate' }));

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
