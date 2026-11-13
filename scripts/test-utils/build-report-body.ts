// A pull request body that ends with the hidden block of a wringer report, as
// `bun verify report --human` prints it, with a verdict of each feature at the fingerprint.
export function buildReportBody(fingerprint: string, features: readonly string[]): string {
  const report = {
    version: 1,
    base: 'origin/main',
    fingerprint,
    complete: true,
    features: features.map((name) => ({
      name,
      changed: true,
      status: 'verified',
      verdict: {
        feature: name,
        fingerprint,
        run: 'run-1',
        at: '2026-03-02T10:00:00.000Z',
        evidence: [],
      },
    })),
    unmapped: [],
  };

  const lines = [
    '## Verification',
    '',
    '<!-- wringer-report v1',
    JSON.stringify(report),
    '-->',
    '',
  ];

  return lines.join('\n');
}
