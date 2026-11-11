import { z } from 'zod';
import { brandSchemas } from './brand-schemas.ts';

export const actorRefSchema = z.union([
  z.literal('boxxy:owner:local'),
  z.templateLiteral(['boxxy:runner:', brandSchemas.runnerId]),
  z.templateLiteral(['boxxy:attempt:', brandSchemas.attemptId]),
  z.templateLiteral(['boxxy:hook:', brandSchemas.attemptId]),
]);
