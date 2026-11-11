import { z } from 'zod';
import type { PullRequestRow } from '../types.ts';
import { brandSchemas } from './brand-schemas.ts';

export const pullRequestRowSchema: z.ZodType<PullRequestRow> = z.object({
  repo: brandSchemas.repoName,
  number: z.number().int().positive(),
  attempt: brandSchemas.attemptId,
  githubId: z.number().int().positive(),
  url: z.url(),
  state: z.enum(['open', 'closed', 'merged']),
  mergedAt: brandSchemas.instant.nullable(),
  mergeCommit: brandSchemas.commitSha.nullable(),
  checkedAt: brandSchemas.instant,
});
