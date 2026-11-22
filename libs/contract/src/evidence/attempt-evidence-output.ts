import { z } from 'zod';

const head = z.string().min(1).max(64);

const checkedRefusal = z.union([
  z.object({ kind: z.literal('refused'), reason: z.literal('no-forge') }),
  z.object({
    kind: z.literal('refused'),
    reason: z.enum(['no-pull-request', 'pull-request-closed']),
  }),
  z.object({
    kind: z.literal('refused'),
    reason: z.enum(['check-pending', 'check-failed', 'check-missing']),
    check: z.string(),
    head,
  }),
  z.object({
    kind: z.literal('refused'),
    reason: z.enum(['verify-pending', 'verify-failed', 'verdict-missing']),
    feature: z.string(),
    head,
    note: z.string().optional(),
  }),
]);

// `retry`: a forge read failed, and the call wrote nothing
export const attemptEvidenceOutput = z.union([
  z.object({ kind: z.literal('recorded'), factId: z.string().min(1).max(64) }),
  z.object({ kind: z.literal('retry') }),
  z.object({ kind: z.literal('refused'), reason: z.enum(['no-attempt', 'not-current']) }),
  checkedRefusal,
]);
