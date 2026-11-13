import { z } from 'zod';

const commit = z.object({ sha: z.string(), commit: z.object({ message: z.string() }) });

// `changes` is the file's added and deleted lines together
const changedLines = z.number().int().nonnegative();
const compareFile = z.object({ filename: z.string().min(1), changes: changedLines });
const runID = z.number().int().positive();
const runCount = z.number().int().nonnegative();

const checkRun = z.object({
  id: runID,
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
});

const commitStatus = z.object({ context: z.string(), state: z.string() });

export const githubSchemas = {
  pullRequest: z.object({
    id: z.number().int().positive(),
    html_url: z.url(),
    state: z.enum(['open', 'closed']),
    merged_at: z.iso.datetime({ offset: true }).nullable(),
    merge_commit_sha: z.string().nullable(),
  }),
  commitPage: z.array(commit),
  pullRequestPage: z.array(z.object({ number: z.number().int().positive() })),
  compare: z.object({ files: z.array(compareFile).optional() }),
  pullRequestBody: z.object({ body: z.string().nullable() }),
  checkRunPage: z.object({ total_count: runCount, check_runs: z.array(checkRun) }),
  combinedStatus: z.object({ statuses: z.array(commitStatus) }),
} as const;
