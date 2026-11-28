import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockPipeline } from '../test-utils/build-mock-pipeline.ts';
import { buildMockSettled } from '../test-utils/build-mock-settled.ts';
import { findPosition, trackPosition } from './find-position.ts';

test('it sends the item back to build with round 2 after a review that requests changes', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline(),
    attempts: [
      buildMockSettled({ phase: 'triage', outcome: 'accepted', endedAt: 1000 }),
      buildMockSettled({ phase: 'design', outcome: 'designed', endedAt: 2000 }),
      buildMockSettled({ phase: 'build', outcome: 'built', endedAt: 3000 }),
      buildMockSettled({ phase: 'review', outcome: 'changes-requested', endedAt: 4000 }),
    ],
    retries: [],
  });

  expect(position).toStrictEqual({ kind: 'phase', phase: 'build', round: 2 });
});

test('it holds the item when a stored outcome is not in the current rules', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline(),
    attempts: [buildMockSettled({ phase: 'triage', outcome: 'needs-split', endedAt: 1000 })],
    retries: [],
  });

  expect(position).toStrictEqual({
    kind: 'hold',
    reason: 'outcome not in rules',
    // oxlint-disable-next-line unicorn/no-thenable -- `then` names the phase a hold resumes; the object is never awaited
    then: 'triage',
    round: 1,
  });
});

test('it holds the item of an unsettleable attempt under rules that map the name its phase code returned', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline({
      steps: {
        review: {
          on: {
            approved: 'next',
            'changes-requested': { to: brandSchemas.phaseName.parse('build'), max: 3 },
          },
        },
      },
    }),
    attempts: [buildMockSettled({ phase: 'review', outcome: 'unsettleable', endedAt: 1000 })],
    retries: [],
  });

  // oxlint-disable-next-line unicorn/no-thenable -- `then` names the phase a hold resumes; the object is never awaited
  expect(position).toMatchObject({ kind: 'hold', reason: 'outcome not in rules', then: 'review' });
});

test('it ends the item with no-pipeline when its kind has no pipeline', () => {
  const position: unknown = findPosition({ pipeline: null, attempts: [], retries: [] });

  expect(position).toStrictEqual({ kind: 'end', reason: 'no-pipeline' });
});

test('it starts an item with no attempts at the first step in round 1', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline(),
    attempts: [],
    retries: [],
  });

  expect(position).toStrictEqual({ kind: 'phase', phase: 'triage', round: 1 });
});

test('it ends the item when the last step takes next', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline({ phases: ['build'] }),
    attempts: [buildMockSettled({ phase: 'build', outcome: 'built', endedAt: 1000 })],
    retries: [],
  });

  expect(position).toStrictEqual({ kind: 'end', reason: 'pipeline-done' });
});

test('it ends the item reviewed after a passed review', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline(),
    attempts: [buildMockSettled({ phase: 'review', outcome: 'passed', endedAt: 1000 })],
    retries: [],
  });

  expect(position).toStrictEqual({ kind: 'end', reason: 'reviewed' });
});

test('it holds the item with the reason of a hold edge, then the phase of the step', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline(),
    attempts: [buildMockSettled({ phase: 'triage', outcome: 'declined', endedAt: 1000 })],
    retries: [],
  });

  // oxlint-disable-next-line unicorn/no-thenable -- `then` names the phase a hold resumes; the object is never awaited
  expect(position).toStrictEqual({ kind: 'hold', reason: 'declined', then: 'triage', round: 1 });
});

test('it runs the phase again after an again edge below maxAttempts', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline(),
    attempts: [buildMockSettled({ phase: 'design', outcome: 'abandoned', endedAt: 1000 })],
    retries: [],
  });

  expect(position).toStrictEqual({ kind: 'phase', phase: 'design', round: 1 });
});

test('it holds the item when attempts in a row reach maxAttempts, mixing lost and again', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline(),
    attempts: [
      buildMockSettled({ phase: 'design', outcome: 'lost', endedAt: 1000, failure: 'stalled' }),
      buildMockSettled({ phase: 'design', outcome: 'abandoned', endedAt: 2000 }),
    ],
    retries: [],
  });

  expect(position).toStrictEqual({
    kind: 'hold',
    reason: 'attempts used up',
    // oxlint-disable-next-line unicorn/no-thenable -- `then` names the phase a hold resumes; the object is never awaited
    then: 'design',
    round: 1,
  });
});

test('it does not count a design attempt that moved on toward the attempts of the next phase', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline(),
    attempts: [
      buildMockSettled({ phase: 'design', outcome: 'abandoned', endedAt: 1000 }),
      buildMockSettled({ phase: 'design', outcome: 'designed', endedAt: 2000 }),
      buildMockSettled({ phase: 'build', outcome: 'abandoned', endedAt: 3000 }),
    ],
    retries: [],
  });

  expect(position).toStrictEqual({ kind: 'phase', phase: 'build', round: 1 });
});

test('it ignores an attempt that failed with usage-limit', () => {
  const failure = 'usage-limit';

  const position: unknown = findPosition({
    pipeline: buildMockPipeline(),
    attempts: [
      buildMockSettled({ phase: 'design', outcome: 'lost', endedAt: 1000, failure }),
      buildMockSettled({ phase: 'design', outcome: 'lost', endedAt: 2000, failure }),
      buildMockSettled({ phase: 'design', outcome: 'lost', endedAt: 3000, failure }),
    ],
    retries: [],
  });

  expect(position).toStrictEqual({ kind: 'phase', phase: 'triage', round: 1 });
});

test('it treats a lost attempt as an again edge', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline(),
    attempts: [
      buildMockSettled({ phase: 'triage', outcome: 'lost', endedAt: 1000, failure: 'stalled' }),
    ],
    retries: [],
  });

  expect(position).toStrictEqual({ kind: 'phase', phase: 'triage', round: 1 });
});

test('it holds with rounds used up on the fourth review that requests changes', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline(),
    attempts: [1, 2, 3, 4].flatMap((turn) => [
      buildMockSettled({ phase: 'build', outcome: 'built', endedAt: turn * 10 }),
      buildMockSettled({ phase: 'review', outcome: 'changes-requested', endedAt: turn * 10 + 5 }),
    ]),
    retries: [],
  });

  expect(position).toStrictEqual({
    kind: 'hold',
    reason: 'rounds used up',
    // oxlint-disable-next-line unicorn/no-thenable -- `then` names the phase a hold resumes; the object is never awaited
    then: 'build',
    round: 4,
  });
});

test('it starts round 5 when the owner retries an item held for rounds used up', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline(),
    attempts: [1, 2, 3, 4].flatMap((turn) => [
      buildMockSettled({ phase: 'build', outcome: 'built', endedAt: turn * 10 }),
      buildMockSettled({ phase: 'review', outcome: 'changes-requested', endedAt: turn * 10 + 5 }),
    ]),
    retries: [{ at: brandSchemas.instant.parse(100), phase: null }],
  });

  expect(position).toStrictEqual({ kind: 'phase', phase: 'build', round: 5 });
});

test('it lifts an attempts-used-up hold with a retry, and resets the count', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline(),
    attempts: [
      buildMockSettled({ phase: 'design', outcome: 'abandoned', endedAt: 1000 }),
      buildMockSettled({ phase: 'design', outcome: 'abandoned', endedAt: 2000 }),
      buildMockSettled({ phase: 'design', outcome: 'abandoned', endedAt: 4000 }),
    ],
    retries: [{ at: brandSchemas.instant.parse(3000), phase: null }],
  });

  expect(position).toStrictEqual({ kind: 'phase', phase: 'design', round: 1 });
});

test('it sends a passed item back to build with a retry that names the phase, one round higher', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline(),
    attempts: [buildMockSettled({ phase: 'review', outcome: 'passed', endedAt: 1000 })],
    retries: [
      { at: brandSchemas.instant.parse(2000), phase: brandSchemas.phaseName.parse('build') },
    ],
  });

  expect(position).toStrictEqual({ kind: 'phase', phase: 'build', round: 2 });
});

test('it leaves an ended item where it is for a retry that names no phase', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline(),
    attempts: [buildMockSettled({ phase: 'review', outcome: 'passed', endedAt: 1000 })],
    retries: [{ at: brandSchemas.instant.parse(2000), phase: null }],
  });

  expect(position).toStrictEqual({ kind: 'end', reason: 'reviewed' });
});

test('it applies a retry at the instant an attempt ended after that attempt', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline(),
    attempts: [buildMockSettled({ phase: 'triage', outcome: 'declined', endedAt: 1000 })],
    retries: [{ at: brandSchemas.instant.parse(1000), phase: null }],
  });

  expect(position).toStrictEqual({ kind: 'phase', phase: 'triage', round: 1 });
});

// The rules-change table of the engine: the same attempts folded over the old and the new rules.

test('it handles a rules change where a changed edge moves an item on to the new target', () => {
  const attempts = [
    buildMockSettled({ phase: 'triage', outcome: 'accepted', endedAt: 1000 }),
    buildMockSettled({ phase: 'design', outcome: 'designed', endedAt: 2000 }),
    buildMockSettled({ phase: 'build', outcome: 'built', endedAt: 3000 }),
  ];

  const before: unknown = findPosition({ pipeline: buildMockPipeline(), attempts, retries: [] });

  const after: unknown = findPosition({
    pipeline: buildMockPipeline({ steps: { build: { on: { built: { end: 'shipped' } } } } }),
    attempts,
    retries: [],
  });

  expect([before, after]).toStrictEqual([
    { kind: 'phase', phase: 'review', round: 1 },
    { kind: 'end', reason: 'shipped' },
  ]);
});

test('it handles a rules change where a raised max frees an item held for rounds used up', () => {
  const attempts = [1, 2, 3, 4].flatMap((turn) => [
    buildMockSettled({ phase: 'build', outcome: 'built', endedAt: turn * 10 }),
    buildMockSettled({ phase: 'review', outcome: 'changes-requested', endedAt: turn * 10 + 5 }),
  ]);

  const position: unknown = findPosition({
    pipeline: buildMockPipeline({
      steps: {
        review: {
          on: {
            passed: { end: 'reviewed' },
            'changes-requested': { to: brandSchemas.phaseName.parse('build'), max: 5 },
          },
        },
      },
    }),
    attempts,
    retries: [],
  });

  expect(position).toStrictEqual({ kind: 'phase', phase: 'build', round: 5 });
});

test('it handles a rules change where a lowered max holds an item that was ready', () => {
  const attempts = [
    buildMockSettled({ phase: 'build', outcome: 'built', endedAt: 10 }),
    buildMockSettled({ phase: 'review', outcome: 'changes-requested', endedAt: 15 }),
    buildMockSettled({ phase: 'build', outcome: 'built', endedAt: 20 }),
    buildMockSettled({ phase: 'review', outcome: 'changes-requested', endedAt: 25 }),
  ];

  const position: unknown = findPosition({
    pipeline: buildMockPipeline({
      steps: {
        review: {
          on: {
            passed: { end: 'reviewed' },
            'changes-requested': { to: brandSchemas.phaseName.parse('build'), max: 1 },
          },
        },
      },
    }),
    attempts,
    retries: [],
  });

  expect(position).toStrictEqual({
    kind: 'hold',
    reason: 'rounds used up',
    // oxlint-disable-next-line unicorn/no-thenable -- `then` names the phase a hold resumes; the object is never awaited
    then: 'build',
    round: 2,
  });
});

test('it handles a rules change where a raised maxAttempts frees an item held for attempts used up', () => {
  const attempts = [
    buildMockSettled({ phase: 'design', outcome: 'abandoned', endedAt: 1000 }),
    buildMockSettled({ phase: 'design', outcome: 'abandoned', endedAt: 2000 }),
  ];

  const position: unknown = findPosition({
    pipeline: buildMockPipeline({ steps: { design: { maxAttempts: 3 } } }),
    attempts,
    retries: [],
  });

  expect(position).toStrictEqual({ kind: 'phase', phase: 'design', round: 1 });
});

test('it handles a rules change where a lowered maxAttempts holds an item that was ready', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline({ steps: { design: { maxAttempts: 1 } } }),
    attempts: [buildMockSettled({ phase: 'design', outcome: 'abandoned', endedAt: 1000 })],
    retries: [],
  });

  expect(position).toStrictEqual({
    kind: 'hold',
    reason: 'attempts used up',
    // oxlint-disable-next-line unicorn/no-thenable -- `then` names the phase a hold resumes; the object is never awaited
    then: 'design',
    round: 1,
  });
});

test('it handles a rules change where a step added after the latest settled phase is run by the item', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline({
      phases: ['triage', 'design', 'build', 'review', 'merge'],
      steps: {
        review: {
          on: {
            passed: 'next',
            'changes-requested': { to: brandSchemas.phaseName.parse('build'), max: 3 },
          },
        },
        merge: { on: { merged: 'next' } },
      },
    }),
    attempts: [buildMockSettled({ phase: 'review', outcome: 'passed', endedAt: 1000 })],
    retries: [],
  });

  expect(position).toStrictEqual({ kind: 'phase', phase: 'merge', round: 1 });
});

test('it handles a rules change where a step added before the latest settled phase does not send the item back', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline({
      phases: ['triage', 'design', 'prepare', 'build', 'review'],
      steps: { prepare: { on: { prepared: 'next' } } },
    }),
    attempts: [
      buildMockSettled({ phase: 'triage', outcome: 'accepted', endedAt: 1000 }),
      buildMockSettled({ phase: 'design', outcome: 'designed', endedAt: 2000 }),
      buildMockSettled({ phase: 'build', outcome: 'built', endedAt: 3000 }),
    ],
    retries: [],
  });

  expect(position).toStrictEqual({ kind: 'phase', phase: 'review', round: 1 });
});

test('it handles a rules change where a removed step skips its attempts and the item stands after the latest remaining phase', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline({ phases: ['triage', 'build', 'review'] }),
    attempts: [
      buildMockSettled({ phase: 'triage', outcome: 'accepted', endedAt: 1000 }),
      buildMockSettled({ phase: 'design', outcome: 'designed', endedAt: 2000 }),
    ],
    retries: [],
  });

  expect(position).toStrictEqual({ kind: 'phase', phase: 'build', round: 1 });
});

test('it handles a rules change where an outcome its phase kind no longer lists holds the item', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline({ steps: { triage: { on: { accepted: 'next' } } } }),
    attempts: [buildMockSettled({ phase: 'triage', outcome: 'duplicate', endedAt: 1000 })],
    retries: [],
  });

  expect(position).toStrictEqual({
    kind: 'hold',
    reason: 'outcome not in rules',
    // oxlint-disable-next-line unicorn/no-thenable -- `then` names the phase a hold resumes; the object is never awaited
    then: 'triage',
    round: 1,
  });
});

test('it handles a rules change where a hold edge that becomes an end edge ends the item', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline({
      steps: { triage: { on: { accepted: 'next', declined: { end: 'declined' } } } },
    }),
    attempts: [buildMockSettled({ phase: 'triage', outcome: 'declined', endedAt: 1000 })],
    retries: [],
  });

  expect(position).toStrictEqual({ kind: 'end', reason: 'declined' });
});

test('it handles a rules change where an item whose kind changed starts at the first step of a pipeline with no triage step', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline({ phases: ['build', 'review'] }),
    attempts: [buildMockSettled({ phase: 'triage', outcome: 'accepted', endedAt: 1000 })],
    retries: [],
  });

  expect(position).toStrictEqual({ kind: 'phase', phase: 'build', round: 1 });
});

test('it handles a rules change where an item whose kind changed goes on from the triage step of the new pipeline', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline({ phases: ['triage', 'build'] }),
    attempts: [buildMockSettled({ phase: 'triage', outcome: 'accepted', endedAt: 1000 })],
    retries: [],
  });

  expect(position).toStrictEqual({ kind: 'phase', phase: 'build', round: 1 });
});

test.each([
  ['next', 'next' as const, { kind: 'phase', phase: 'review', round: 1 }],
  ['an end', { end: 'merged' }, { kind: 'end', reason: 'merged' }],
])('it takes the skip edge %s after a skipped attempt', (_label, skip, expected) => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline({ steps: { build: { skip } } }),
    attempts: [
      buildMockSettled({ phase: 'triage', outcome: 'accepted', endedAt: 1000 }),
      buildMockSettled({ phase: 'design', outcome: 'designed', endedAt: 2000 }),
      buildMockSettled({ phase: 'build', outcome: 'skipped', endedAt: 3000 }),
    ],
    retries: [],
  });

  expect(position).toStrictEqual(expected);
});

test('it holds with the skip edge reason after a skipped attempt', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline({
      steps: { build: { skip: { hold: brandSchemas.rulesHoldReason.parse('no-live-check') } } },
    }),
    attempts: [buildMockSettled({ phase: 'build', outcome: 'skipped', endedAt: 1000 })],
    retries: [],
  });

  expect(position).toStrictEqual({
    kind: 'hold',
    reason: 'no-live-check',
    // oxlint-disable-next-line unicorn/no-thenable -- `then` names the phase a hold resumes; the object is never awaited
    then: 'build',
    round: 1,
  });
});

test('it holds the item when a skipped attempt finds its step without a skip edge', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline(),
    attempts: [buildMockSettled({ phase: 'build', outcome: 'skipped', endedAt: 1000 })],
    retries: [],
  });

  expect(position).toStrictEqual({
    kind: 'hold',
    reason: 'outcome not in rules',
    // oxlint-disable-next-line unicorn/no-thenable -- `then` names the phase a hold resumes; the object is never awaited
    then: 'build',
    round: 1,
  });
});

test('it passes a skipped step when a retry lever carries the instant of the skip', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline({ steps: { build: { skip: 'next' } } }),
    attempts: [
      buildMockSettled({ phase: 'triage', outcome: 'accepted', endedAt: 500 }),
      buildMockSettled({ phase: 'design', outcome: 'designed', endedAt: 600 }),
      buildMockSettled({ phase: 'build', outcome: 'skipped', endedAt: 1000 }),
    ],
    retries: [
      { at: brandSchemas.instant.parse(1000), phase: brandSchemas.phaseName.parse('build') },
    ],
  });

  expect(position).toStrictEqual({ kind: 'phase', phase: 'review', round: 2 });
});

test('it passes a skipped step when a retry lever is stamped after the instant of the read', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline({ steps: { build: { skip: 'next' } } }),
    attempts: [
      buildMockSettled({ phase: 'triage', outcome: 'accepted', endedAt: 500 }),
      buildMockSettled({ phase: 'design', outcome: 'designed', endedAt: 600 }),
      buildMockSettled({ phase: 'build', outcome: 'skipped', endedAt: 1000 }),
    ],
    retries: [
      { at: brandSchemas.instant.parse(1001), phase: brandSchemas.phaseName.parse('build') },
    ],
    now: brandSchemas.instant.parse(1000),
  });

  expect(position).toStrictEqual({ kind: 'phase', phase: 'review', round: 1 });
});

test('it sends the item back to the skipped step when a retry lever is stamped by the instant of the read', () => {
  const position: unknown = findPosition({
    pipeline: buildMockPipeline({ steps: { build: { skip: 'next' } } }),
    attempts: [
      buildMockSettled({ phase: 'triage', outcome: 'accepted', endedAt: 500 }),
      buildMockSettled({ phase: 'design', outcome: 'designed', endedAt: 600 }),
      buildMockSettled({ phase: 'build', outcome: 'skipped', endedAt: 1000 }),
    ],
    retries: [
      { at: brandSchemas.instant.parse(1001), phase: brandSchemas.phaseName.parse('build') },
    ],
    now: brandSchemas.instant.parse(1001),
  });

  expect(position).toStrictEqual({ kind: 'phase', phase: 'build', round: 2 });
});

test.each([
  { title: 'no attempt or lever', attempts: [], retries: [], since: null },
  {
    title: 'a settled attempt',
    attempts: [buildMockSettled({ phase: 'triage', outcome: 'accepted', endedAt: 1000 })],
    retries: [],
    since: 1000,
  },
  {
    title: 'a retry lever after the attempts',
    attempts: [buildMockSettled({ phase: 'triage', outcome: 'accepted', endedAt: 1000 })],
    retries: [
      { at: brandSchemas.instant.parse(2000), phase: brandSchemas.phaseName.parse('triage') },
    ],
    since: 2000,
  },
  {
    title: 'a retry lever with no phase while the item stays at the step',
    attempts: [buildMockSettled({ phase: 'triage', outcome: 'accepted', endedAt: 1000 })],
    retries: [{ at: brandSchemas.instant.parse(2000), phase: null }],
    since: 1000,
  },
])('#trackPosition gives the start of the stay after $title', (row) => {
  const found = trackPosition({
    pipeline: buildMockPipeline(),
    attempts: row.attempts,
    retries: row.retries,
  });

  const expected = row.since === null ? null : brandSchemas.instant.parse(row.since);

  expect(found.since).toBe(expected);
});

function setupTest() {
  const pipeline = buildMockPipeline({
    phases: ['build', 'review', 'merge'],
    steps: {
      review: {
        on: {
          passed: 'next',
          'changes-requested': { to: brandSchemas.phaseName.parse('build'), max: 3 },
        },
      },
      merge: {
        on: {
          merged: { end: 'merged' },
          'needs-signoff': { hold: brandSchemas.rulesHoldReason.parse('awaiting sign-off') },
          'changes-requested': { to: brandSchemas.phaseName.parse('build'), max: 1 },
        },
      },
    },
  });

  const attempts = [
    buildMockSettled({ phase: 'build', outcome: 'built', endedAt: 1000 }),
    buildMockSettled({ phase: 'review', outcome: 'changes-requested', endedAt: 2000 }),
    buildMockSettled({ phase: 'build', outcome: 'built', endedAt: 3000 }),
    buildMockSettled({ phase: 'review', outcome: 'passed', endedAt: 4000 }),
    buildMockSettled({ phase: 'merge', outcome: 'needs-signoff', endedAt: 5000 }),
  ];

  return { pipeline, attempts };
}

test('it moves an item at the sign-off hold to the merge step with its round kept', () => {
  const ctx = setupTest();

  const position: unknown = findPosition({
    pipeline: ctx.pipeline,
    attempts: ctx.attempts,
    retries: [{ at: brandSchemas.instant.parse(6000), phase: null, signoff: true }],
  });

  expect(position).toStrictEqual({ kind: 'phase', phase: 'merge', round: 2 });
});

test('it moves nothing for a sign-off lever at a hold that is not the sign-off hold', () => {
  const ctx = setupTest();

  const position: unknown = findPosition({
    pipeline: ctx.pipeline,
    attempts: [buildMockSettled({ phase: 'build', outcome: 'blocked', endedAt: 1000 })],
    retries: [{ at: brandSchemas.instant.parse(2000), phase: null, signoff: true }],
  });

  // oxlint-disable-next-line unicorn/no-thenable -- `then` names the phase a hold resumes; the object is never awaited
  expect(position).toMatchObject({ kind: 'hold', then: 'build' });
});

test('it moves nothing for a sign-off lever at a step that is not a hold', () => {
  const ctx = setupTest();

  const position: unknown = findPosition({
    pipeline: ctx.pipeline,
    attempts: [],
    retries: [{ at: brandSchemas.instant.parse(2000), phase: null, signoff: true }],
  });

  expect(position).toStrictEqual({ kind: 'phase', phase: 'build', round: 1 });
});

test('it keeps the count of an edge across a sign-off lever', () => {
  const ctx = setupTest();

  const position: unknown = findPosition({
    pipeline: ctx.pipeline,
    attempts: [
      ...ctx.attempts,
      buildMockSettled({ phase: 'merge', outcome: 'changes-requested', endedAt: 7000 }),
      buildMockSettled({ phase: 'build', outcome: 'built', endedAt: 8000 }),
      buildMockSettled({ phase: 'review', outcome: 'passed', endedAt: 9000 }),
      buildMockSettled({ phase: 'merge', outcome: 'needs-signoff', endedAt: 10_000 }),
      buildMockSettled({ phase: 'merge', outcome: 'changes-requested', endedAt: 12_000 }),
    ],
    retries: [
      { at: brandSchemas.instant.parse(6000), phase: null, signoff: true },
      { at: brandSchemas.instant.parse(11_000), phase: null, signoff: true },
    ],
  });

  // the second send-back from the merge step is past its max of 1
  // oxlint-disable-next-line unicorn/no-thenable -- `then` names the phase a hold resumes; the object is never awaited
  expect(position).toMatchObject({ kind: 'hold', reason: 'rounds used up', then: 'build' });
});

test('it starts a new round for an item.retry at the sign-off hold, as at any hold', () => {
  const ctx = setupTest();

  const position: unknown = findPosition({
    pipeline: ctx.pipeline,
    attempts: ctx.attempts,
    retries: [{ at: brandSchemas.instant.parse(6000), phase: null }],
  });

  expect(position).toStrictEqual({ kind: 'phase', phase: 'merge', round: 2 });
});
