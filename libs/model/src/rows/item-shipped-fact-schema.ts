import { z } from 'zod';
import { brandSchemas } from './brand-schemas.ts';

// The fact payload: `release` is absent unless the rule is `release-then-deploy`.
export const itemShippedFactSchema = z.object({
  itemId: brandSchemas.itemId,
  commit: brandSchemas.commitSha,
  rule: z.enum(['deploy-tag', 'release', 'release-then-deploy']),
  ref: z.string().min(1),
  release: z.string().min(1).exactOptional(),
  seenAt: brandSchemas.instant,
});
