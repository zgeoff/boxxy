import { expect, test } from 'bun:test';
import { buildReportBody } from './build-report-body.ts';

test('it ends the body with a data comment that holds a claim of each feature', () => {
  const body = buildReportBody({
    fingerprint: 'abc123',
    featureFingerprints: { 'file-item': 'def456' },
  });

  expect(body.split('\n')).toStrictEqual([
    '## Verification',
    '',
    `<!-- wringer-data v2 ${JSON.stringify({
      version: 2,
      registry: 'boxxy-verify',
      base: 'origin/main',
      fingerprint: 'abc123',
      claims: [
        {
          feature: 'file-item',
          fingerprint: 'abc123',
          featureFingerprint: 'def456',
          run: 'run-1',
          at: '2026-03-02T10:00:00.000Z',
          target: { name: 'local', evidence: 'local' },
          pin: { kind: 'local' },
          evidenceDigest: '0'.repeat(64),
          evidenceCount: 0,
        },
      ],
    })} -->`,
    '',
  ]);
});
