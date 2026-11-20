import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockV1LeverRow } from '@boxxy/model/test-utils/build-mock-v1-lever-row';
import { pickSignoffVerdict } from './pick-signoff-verdict.ts';

test('it picks no verdict from an item with no sign-off lever', () => {
  const verdict = pickSignoffVerdict([buildMockV1LeverRow({ kind: 'item.retry' })], []);

  expect(verdict).toBeNull();
});

test('it picks the latest sign-off lever', () => {
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');

  const verdict = pickSignoffVerdict(
    [
      buildMockV1LeverRow({ seq: 1, kind: 'signoff.approve', head, reason: null }),
      buildMockV1LeverRow({ seq: 2, kind: 'signoff.send-back', head, reason: 'Fix the rule' }),
    ],
    [],
  );

  expect(verdict).toStrictEqual({
    head,
    verdict: 'send-back',
    findings: 'Fix the rule',
    lever: 2,
  });
});

test('it keeps an approval after a merge attempt finished on it', () => {
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');

  const verdict = pickSignoffVerdict(
    [
      buildMockV1LeverRow({
        seq: 1,
        kind: 'signoff.approve',
        head,
        reason: null,
        at: brandSchemas.instant.parse(1000),
      }),
    ],
    [
      buildMockV1AttemptRow({
        phase: brandSchemas.phaseName.parse('merge'),
        endedAt: brandSchemas.instant.parse(2000),
      }),
    ],
  );

  expect(verdict).toStrictEqual({ head, verdict: 'approve', findings: null, lever: 1 });
});

test('it drops a send-back once a merge attempt finished after it', () => {
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');

  const verdict = pickSignoffVerdict(
    [
      buildMockV1LeverRow({
        seq: 1,
        kind: 'signoff.send-back',
        head,
        reason: 'Fix it',
        at: brandSchemas.instant.parse(1000),
      }),
    ],
    [
      buildMockV1AttemptRow({
        phase: brandSchemas.phaseName.parse('merge'),
        endedAt: brandSchemas.instant.parse(2000),
      }),
    ],
  );

  expect(verdict).toBeNull();
});

test('it keeps a send-back that only an earlier merge attempt and a later review finished on', () => {
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');

  const verdict = pickSignoffVerdict(
    [
      buildMockV1LeverRow({
        seq: 1,
        kind: 'signoff.send-back',
        head,
        reason: 'Fix it',
        at: brandSchemas.instant.parse(3000),
      }),
    ],
    [
      buildMockV1AttemptRow({
        phase: brandSchemas.phaseName.parse('merge'),
        endedAt: brandSchemas.instant.parse(2000),
      }),
      buildMockV1AttemptRow({
        phase: brandSchemas.phaseName.parse('review'),
        endedAt: brandSchemas.instant.parse(4000),
      }),
    ],
  );

  expect(verdict).toStrictEqual({ head, verdict: 'send-back', findings: 'Fix it', lever: 1 });
});
