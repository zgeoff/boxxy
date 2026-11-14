interface ReportBodyOptions {
  // the patch ID of the whole change
  readonly fingerprint: string;

  // the patch ID of each feature's part of the change, by feature name
  readonly featureFingerprints: Readonly<Record<string, string>>;
}

// A pull request body that ends with the data comment of a wringer report, as
// `bun verify publish` writes it, with a claim for each feature.
export function buildReportBody(options: ReportBodyOptions): string {
  const comment = {
    version: 2,
    registry: 'boxxy-verify',
    base: 'origin/main',
    fingerprint: options.fingerprint,
    claims: Object.entries(options.featureFingerprints).map(([feature, featureFingerprint]) => ({
      feature,
      fingerprint: options.fingerprint,
      featureFingerprint,
      run: 'run-1',
      at: '2026-03-02T10:00:00.000Z',
      target: { name: 'local', evidence: 'local' },
      pin: { kind: 'local' },
      evidenceDigest: '0'.repeat(64),
      evidenceCount: 0,
    })),
  };

  return ['## Verification', '', `<!-- wringer-data v2 ${JSON.stringify(comment)} -->`, ''].join(
    '\n',
  );
}
