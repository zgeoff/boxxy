import { expect, test } from 'bun:test';
import { buildReportBody } from './build-report-body.ts';

test('it ends the body with a report block that holds a verdict of each feature', () => {
  const body = buildReportBody('abc123', ['file-item']);

  expect(body.split('\n')).toStrictEqual([
    '## Verification',
    '',
    '<!-- wringer-report v1',
    JSON.stringify({
      version: 1,
      base: 'origin/main',
      fingerprint: 'abc123',
      complete: true,
      features: [
        {
          name: 'file-item',
          changed: true,
          status: 'verified',
          verdict: {
            feature: 'file-item',
            fingerprint: 'abc123',
            run: 'run-1',
            at: '2026-03-02T10:00:00.000Z',
            evidence: [],
          },
        },
      ],
      unmapped: [],
    }),
    '-->',
    '',
  ]);
});
