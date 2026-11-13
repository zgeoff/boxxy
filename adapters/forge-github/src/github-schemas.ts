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
const requiredCheck = z.object({ context: z.string().min(1) });

// GitHub's own name is `enforcement_level`; `off` lists contexts that the branch does not require
const classicRequiredChecks = z.object({
  enforcement_level: z.string().optional(),
  contexts: z.array(z.string().min(1)),
  checks: z.array(requiredCheck).optional(),
});

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
  combinedStatus: z.object({ total_count: runCount, statuses: z.array(commitStatus) }),

  // `null` while GitHub works out whether the head merges into the base
  mergeability: z.object({ mergeable: z.boolean().nullable() }),
  merged: z.object({ sha: z.string(), merged: z.literal(true) }),
  refusal: z.object({ message: z.string() }),
  branchRulePage: z.array(z.object({ type: z.string(), parameters: z.unknown().optional() })),
  requiredStatusChecksRule: z.object({ required_status_checks: z.array(requiredCheck) }),
  branch: z.object({
    protection: z.object({ required_status_checks: classicRequiredChecks.optional() }).optional(),
  }),
} as const;
