import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockPipeline } from '../test-utils/build-mock-pipeline.ts';
import { buildMockSettled } from '../test-utils/build-mock-settled.ts';
import { findPosition } from './find-position.ts';

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

test.each(['no-capacity', 'usage-limit'])(
  'it ignores an attempt that failed with %s',
  (failure) => {
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
  },
);

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
