import { z } from 'zod';
import type { AttemptSessionRow } from '../types.ts';
import { brandSchemas } from './brand-schemas.ts';

export const attemptSessionRowSchema: z.ZodType<AttemptSessionRow> = z.object({
  attempt: brandSchemas.attemptId,
  agentSession: brandSchemas.agentSessionId,
  atcSession: brandSchemas.atcSessionId,
  product: z.enum(['claude_code', 'codex']),
  source: z.enum(['worker', 'hook']),
  seenAt: brandSchemas.instant,
});
