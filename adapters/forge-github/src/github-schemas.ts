import { z } from 'zod';

const commit = z.object({ sha: z.string(), commit: z.object({ message: z.string() }) });

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
} as const;
