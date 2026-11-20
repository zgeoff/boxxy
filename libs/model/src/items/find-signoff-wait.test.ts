import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockMergeCloseOut } from '../test-utils/build-mock-merge-close-out.ts';
import { buildMockPipeline } from '../test-utils/build-mock-pipeline.ts';
import { buildMockV1AttemptRow } from '../test-utils/build-mock-v1-attempt-row.ts';
import { findSignoffWait } from './find-signoff-wait.ts';

function setupTest() {
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');

  const pipeline = buildMockPipeline({
    phases: ['build', 'merge'],
    steps: {
      merge: {
        on: {
          merged: { end: 'merged' },
          'needs-signoff': { hold: brandSchemas.rulesHoldReason.parse('owner sign-off') },
        },
      },
    },
  });

  const position = {
    kind: 'hold',
    reason: brandSchemas.rulesHoldReason.parse('owner sign-off'),
    // oxlint-disable-next-line unicorn/no-thenable -- `then` names the phase a hold resumes; the object is never awaited
    then: brandSchemas.phaseName.parse('merge'),
    round: 1,
  } as const;

  const waiting = buildMockV1AttemptRow({
    phase: brandSchemas.phaseName.parse('merge'),
    state: 'failed',
    outcome: brandSchemas.outcomeName.parse('needs-signoff'),
    endedAt: brandSchemas.instant.parse(5000),
    input: { pullRequest: { repo: 'acme/skills', number: 40, url: 'https://example.test/40' } },
    closeOut: buildMockMergeCloseOut({
      outcome: 'needs-signoff',
      head,
      mergeCommit: null,
      byBoxxy: false,
      signoff: { rules: ['skills'], paths: ['testing/SKILL.md'], truncated: false },
    }),
  });

  return { head, pipeline, position, waiting };
}

test('it finds the head, rules and paths of the merge attempt that sent the item to the hold', () => {
  const ctx = setupTest();

  const wait: unknown = findSignoffWait({
    pipeline: ctx.pipeline,
    position: ctx.position,
    attempts: [ctx.waiting],
  });

  expect(wait).toStrictEqual({
    pullRequest: { repo: 'acme/skills', number: 40 },
    head: ctx.head,
    rules: ['skills'],
    paths: ['testing/SKILL.md'],
    truncated: false,
    since: 5000,
  });
});

test('it finds no wait for an item that stands at another hold', () => {
  const ctx = setupTest();

  const wait = findSignoffWait({
    pipeline: ctx.pipeline,
    position: { ...ctx.position, reason: brandSchemas.rulesHoldReason.parse('declined') },
    attempts: [ctx.waiting],
  });

  expect(wait).toBeNull();
});

test('it finds no wait for an item at a step', () => {
  const ctx = setupTest();

  const wait = findSignoffWait({
    pipeline: ctx.pipeline,
    position: { kind: 'phase', phase: brandSchemas.phaseName.parse('merge'), round: 1 },
    attempts: [ctx.waiting],
  });

  expect(wait).toBeNull();
});

test('it finds no wait while an attempt of the item runs', () => {
  const ctx = setupTest();

  const wait = findSignoffWait({
    pipeline: ctx.pipeline,
    position: ctx.position,
    attempts: [ctx.waiting, buildMockV1AttemptRow({ endedAt: null })],
  });

  expect(wait).toBeNull();
});

test('it finds no wait when the latest merge attempt finished on another outcome', () => {
  const ctx = setupTest();

  const merged = {
    ...ctx.waiting,
    outcome: brandSchemas.outcomeName.parse('merged'),
    endedAt: brandSchemas.instant.parse(6000),
  };

  const wait = findSignoffWait({
    pipeline: ctx.pipeline,
    position: ctx.position,
    attempts: [ctx.waiting, merged],
  });

  expect(wait).toBeNull();
});
