import { faker } from '@faker-js/faker';
import type { ReviewResult } from '@noslop/cli';

type Finding = ReviewResult['findings'][number];

interface MockReviewResultInput {
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
  readonly head?: string;
  readonly findings?: readonly {
    readonly id: string;
    readonly severity: Finding['severity'];
    readonly path: string;
  }[];
  readonly failedCalls?: number;
  readonly fixesOnly?: {
    readonly fixChecks: readonly { readonly findingID: string; readonly fixed: boolean }[];
  };
}

// noslop sets each finding's severity from its criterion
const criterionBySeverity = {
  P1: 'outage',
  P2: 'untested-change',
  P3: 'naming',
} as const satisfies Record<Finding['severity'], Finding['criterion']>;

// A noslop review result for one pull request, at a random head, with one model call. A finding
// ID is 16 hex characters.
export function buildMockReviewResult(input: MockReviewResultInput): ReviewResult {
  const callID = `call-${faker.string.alphanumeric(6)}`;

  return {
    version: 7,
    reviewID: `review-${faker.string.alphanumeric(8)}`,
    repo: `${input.owner}/${input.repo}`,
    pullRequest: { owner: input.owner, repo: input.repo, number: input.number },
    base: faker.git.commitSha({ length: 40 }).toLowerCase(),
    head: input.head ?? faker.git.commitSha({ length: 40 }).toLowerCase(),
    title: faker.lorem.sentence(),
    depth: 'standard',
    special: null,
    riskClasses: [],
    lenses: ['correctness'],
    calls: [
      {
        id: callID,
        lenses: ['correctness'],
        depth: 'standard',
        adapter: 'claude',
        model: 'claude-test-model',
        effort: 'medium',
        status: 'ok',
        attempts: 1,
        tokens: { input: 1200, cachedInput: 300, cacheWrite: 40, output: 210 },
        durationMs: 4100,
      },
    ],
    findings: (input.findings ?? []).map((finding) => ({
      id: finding.id,
      lens: 'correctness',
      callID,

      // noslop caps a finding title at 80 characters
      title: faker.lorem.words(3),
      body: faker.lorem.paragraph(),
      anchor: { path: finding.path, startLine: 3, endLine: 5 },
      severity: finding.severity,
      criterion: criterionBySeverity[finding.severity],
      verdict: 'CONFIRMED',
      writtenByChange: true,
    })),
    dropped: [],
    failedCalls: Array.from({ length: input.failedCalls ?? 0 }, (_, index) => ({
      id: `failed-${index}`,
      lenses: ['tests'],
      reason: 'the model gave no answer',
    })),
    notReviewed: [],
    notReviewedByLens: [],
    configHash: faker.string.hexadecimal({ length: 16, casing: 'lower', prefix: '' }),
    ...(input.fixesOnly === undefined
      ? {}
      : {
          fixesOnly: true,
          fixChecks: input.fixesOnly.fixChecks.map((fixCheck) => ({
            ...fixCheck,
            reason: faker.lorem.sentence(),
          })),
        }),
    startedAt: '2026-10-01T10:00:00Z',
    endedAt: '2026-10-01T10:04:00Z',
  };
}
