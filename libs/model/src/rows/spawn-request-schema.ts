import type { JsonValue } from '@boxxy/content-hash';
import { z } from 'zod';
import type { GitSource, SpawnRequest } from '../ports/types.ts';
import type { RepoName } from '../types.ts';
import { brandSchemas } from './brand-schemas.ts';

// git must never read the URL or the ref as an option, and atc refuses a URL with a credential
export const gitSourceSchema: z.ZodType<GitSource> = z.strictObject({
  url: z
    .url()
    .max(2048)
    .refine((url) => !url.startsWith('-'), 'a git source url must not start with -')
    .refine((url) => isURLWithoutCredential(url), 'a git source url must carry no credential'),
  ref: z
    .string()
    .min(1)
    .max(255)
    .refine((ref) => !ref.startsWith('-'), 'a git source ref must not start with -'),

  // atc's own rule for the name of an environment variable
  credentialRef: z
    .strictObject({
      name: z
        .string()
        .max(255)
        .regex(/^[A-Za-z_]\w*$/u, 'a credentialRef names an environment variable'),
    })
    .exactOptional(),
});

const spawnRequestFields = z.strictObject({
  target: z.string().min(1),
  prompt: z.string(),
  agent: z.string().min(1),
  model: z.string().min(1),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']),
  name: z.templateLiteral(['boxxy/', z.string()]),
  idempotencyKey: brandSchemas.attemptId,
  repo: brandSchemas.repoName,
  phase: z.string().min(1),
});

// The spawn request as the attempt row stores it, read back for a respawn. A request with both a
// folder and a source, or with neither, fails the parse.
export const spawnRequestSchema: z.ZodType<SpawnRequest> = spawnRequestFields
  .extend({ cwd: z.string().min(1).optional(), source: gitSourceSchema.optional() })
  .transform((request, ctx): SpawnRequest => {
    const { cwd, source, ...fields } = request;

    if (cwd !== undefined && source === undefined) {
      return { ...fields, cwd };
    }

    if (source !== undefined && cwd === undefined) {
      return { ...fields, source };
    }

    ctx.addIssue({ code: 'custom', message: 'a spawn request takes a cwd or a source, not both' });

    return z.NEVER;
  });

// the attempt that a stored spawn request belongs to
interface StoredSpawnOwner {
  readonly repo: RepoName;
  readonly phase: string;
}

// Reads a stored spawn request. A request stored before it carried a repo and a phase reads with
// the attempt's own.
export function parseStoredSpawnRequest(
  stored: JsonValue,
  attempt: StoredSpawnOwner,
): SpawnRequest {
  const fields = z.record(z.string(), z.unknown()).safeParse(stored);

  if (!fields.success) {
    return spawnRequestSchema.parse(stored);
  }

  return spawnRequestSchema.parse({ repo: attempt.repo, phase: attempt.phase, ...fields.data });
}

function isURLWithoutCredential(url: string): boolean {
  const parsed = URL.parse(url);

  return parsed !== null && parsed.username === '' && parsed.password === '';
}
