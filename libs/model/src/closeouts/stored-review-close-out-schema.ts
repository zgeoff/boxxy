import { z } from 'zod';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { reviewCloseOutSchema } from './review-close-out-schema.ts';
import type { ReviewCloseOut } from './types.ts';

// A stored review close-out, of either shape the store holds. The review phase kind parses a new
// close-out with the strict schema, so a session can never send the older shape.
export const storedReviewCloseOutSchema = z.preprocess(
  upgradeLegacyReview,
  reviewCloseOutSchema.extend({
    round: z.number().int().positive().nullable(),
    cause: z.enum(['first', 'rework', 'recheck']).nullable(),
  }),
) satisfies z.ZodType<ReviewCloseOut>;

const legacyFindingSchema = z.object({
  title: z.string(),
  body: z.string(),
  path: z.string().min(1).exactOptional(),
  line: z.number().int().positive().exactOptional(),
});

const legacyVerdictSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('passed') }),
  z.object({ kind: z.literal('changes-requested'), findings: z.array(legacyFindingSchema) }),
]);

// The fields of the close-out that the review session sent before the review gate, which the
// upgrade reads. The parser of that time had already checked them.
const legacyReviewSchema = z.object({
  verdict: legacyVerdictSchema,
  noslop: z.object({ reviewID: z.string().min(1), head: brandSchemas.commitSha }),
});

// A review close-out stored before the review gate holds the session's verdict and a summary of
// noslop's result. It reads as the gate's reading of that head, with no change to the stored
// data. That close-out kept no round, cause, cost or severity, and its findings live only in it.
function upgradeLegacyReview(value: unknown): unknown {
  const legacy = legacyReviewSchema.safeParse(value);

  if (!legacy.success) {
    return value;
  }

  const verdict = legacy.data.verdict;

  const run = {
    head: legacy.data.noslop.head,
    closedWithoutFix: 0,
    cost: { calls: [] },
    ref: legacy.data.noslop.reviewID,
  };

  const reading =
    verdict.kind === 'passed'
      ? {
          status: 'passed',
          ...run,
          open: { high: 0, medium: 0, low: 0 },
          findingPaths: [],
          answerHint: '',
        }
      : {
          status: 'blocked',
          why: 'open-findings',
          ...run,
          open: { high: verdict.findings.length, medium: 0, low: 0 },
          findingPaths: [...new Set(verdict.findings.flatMap((finding) => finding.path ?? []))],
          answerHint: formatLegacyFindings(verdict.findings),
        };

  return { round: null, cause: null, reading, unrelatedLines: null };
}

type LegacyFinding = z.output<typeof legacyFindingSchema>;

function formatLegacyFindings(findings: readonly LegacyFinding[]): string {
  const entries = findings.map((finding) => {
    const place =
      finding.path === undefined
        ? []
        : [finding.line === undefined ? finding.path : `${finding.path}:${finding.line}`];

    return [`### ${finding.title}`, ...place, finding.body].join('\n');
  });

  return ['Fix each of these findings:', ...entries].join('\n\n');
}
