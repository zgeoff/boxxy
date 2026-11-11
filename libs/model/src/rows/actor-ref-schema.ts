import { z } from 'zod';
import type { ActorRef } from '../types.ts';

const runnerIdSchema = z.string().regex(/^[a-z0-9-]+$/u);

const attemptIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);

// The parts are unbranded strings, so that the output is `ActorRef` itself: a branded part
// would give a narrower template type than the one the store and the facts declare.
export const actorRefSchema = z.union([
  z.literal('boxxy:owner:local'),
  z.templateLiteral(['boxxy:runner:', runnerIdSchema]),
  z.templateLiteral(['boxxy:attempt:', attemptIdSchema]),
  z.templateLiteral(['boxxy:hook:', attemptIdSchema]),
]) satisfies z.ZodType<ActorRef>;
