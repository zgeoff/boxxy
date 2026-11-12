import { expect, test } from 'bun:test';
import type { KeptSession } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockPipeline } from '@boxxy/model/test-utils/build-mock-pipeline';
import { buildMockSettledAttemptRow } from '@boxxy/model/test-utils/build-mock-settled-attempt-row';
import { buildMockV1ItemView } from '@boxxy/model/test-utils/build-mock-v1-item-view';
import { pickKeptSession } from './pick-kept-session.ts';

test.each([
  ['a builder verify after a passed review', 'verify', 'passed', true],
  ['a rework build after a review asked for changes', 'build', 'changes-requested', false],
])('it wakes the kept session for %s', (_title, phase, outcome, isBuilderSession) => {
  const kept: KeptSession = {
    atcSession: brandSchemas.atcSessionId.parse('atc-build-1'),
    target: 'worker-host',
    attempt: brandSchemas.attemptId.parse('0192f0c5-3c4d-7e5f-a061-7b8c9d0e1f2a'),
    keptAt: brandSchemas.instant.parse(1000),
    caller: null,
  };

  const pick = pickKeptSession({
    item: buildMockV1ItemView({ keptSession: kept }),
    attempts: [buildMockSettledAttemptRow({ phase: 'review', outcome, endedAt: 2000 })],
    pipeline: buildMockPipeline({ phases: ['build', 'review', 'verify'] }),
    phase: brandSchemas.phaseName.parse(phase),
    isBuilderSession,
  });

  expect(pick).toStrictEqual({ kind: 'kept', session: kept });
});

test('it wakes no kept session for a fresh verify', () => {
  const pick = pickKeptSession({
    item: buildMockV1ItemView({
      keptSession: {
        atcSession: brandSchemas.atcSessionId.parse('atc-build-1'),
        target: 'worker-host',
        attempt: brandSchemas.attemptId.parse('0192f0c5-3c4d-7e5f-a061-7b8c9d0e1f2a'),
        keptAt: brandSchemas.instant.parse(1000),
        caller: null,
      },
    }),
    attempts: [buildMockSettledAttemptRow({ phase: 'review', outcome: 'passed', endedAt: 2000 })],
    pipeline: buildMockPipeline({ phases: ['build', 'review', 'verify'] }),
    phase: brandSchemas.phaseName.parse('verify'),
    isBuilderSession: false,
  });

  expect(pick).toStrictEqual({ kind: 'none' });
});

test.each([
  {
    title: 'a builder verify',
    phase: 'verify',
    outcome: 'passed',
    isBuilder: true,
    picked: 'gone',
  },
  {
    title: 'a rework build',
    phase: 'build',
    outcome: 'changes-requested',
    isBuilder: false,
    picked: 'gone',
  },
  { title: 'a fresh verify', phase: 'verify', outcome: 'passed', isBuilder: false, picked: 'none' },
])('it picks $picked for $title on an item with no kept session', (row) => {
  const pick = pickKeptSession({
    item: buildMockV1ItemView({ keptSession: null }),
    attempts: [
      buildMockSettledAttemptRow({ phase: 'review', outcome: row.outcome, endedAt: 2000 }),
    ],
    pipeline: buildMockPipeline({ phases: ['build', 'review', 'verify'] }),
    phase: brandSchemas.phaseName.parse(row.phase),
    isBuilderSession: row.isBuilder,
  });

  expect(pick).toStrictEqual({ kind: row.picked });
});
