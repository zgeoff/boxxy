import { z } from 'zod';
import type { SpawnRequest } from '../ports/types.ts';
import { brandSchemas } from './brand-schemas.ts';

// The spawn request as the attempt row stores it, read back for a respawn.
export const spawnRequestSchema: z.ZodType<SpawnRequest> = z.object({
  target: z.string().min(1),
  cwd: z.string().min(1),
  prompt: z.string(),
  agent: z.string().min(1),
  model: z.string().min(1),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']),
  name: z.templateLiteral(['boxxy/', z.string()]),
  idempotencyKey: brandSchemas.attemptId,
});
