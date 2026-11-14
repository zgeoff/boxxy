import { faker } from '@faker-js/faker';
import type { FeatureStatus, Report } from '@wringer/core';

interface MockWringerReportInput {
  readonly features: readonly { readonly name: string; readonly status: FeatureStatus }[];
}

// A wringer report against `origin/main` at a random fingerprint. A `verified` or `stale` feature
// carries a verdict, and only an `unchanged` feature is unchanged.
export function buildMockWringerReport(input: MockWringerReportInput): Report {
  const fingerprint = faker.string.hexadecimal({ length: 40, casing: 'lower', prefix: '' });

  return {
    base: 'origin/main',
    fingerprint,
    complete: input.features.every(
      (feature) => feature.status === 'verified' || feature.status === 'unchanged',
    ),
    features: input.features.map((feature) => ({
      name: feature.name,
      changed: feature.status !== 'unchanged',
      status: feature.status,
      verdict:
        feature.status === 'verified' || feature.status === 'stale'
          ? {
              feature: feature.name,
              fingerprint,
              featureFingerprint:
                feature.status === 'verified'
                  ? fingerprint
                  : faker.string.hexadecimal({ length: 40, casing: 'lower', prefix: '' }),
              run: `run-${faker.string.alphanumeric(8)}`,
              at: faker.date.recent().toISOString(),
              target: { name: 'local', evidence: 'local' as const },
              pin: { kind: 'local' as const },
              evidence: [],
            }
          : null,
    })),
    unmapped: [],
  };
}
