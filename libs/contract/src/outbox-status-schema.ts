import { z } from 'zod';

const count = z.number().int();
const instantOrNull = z.number().nullable();

const outboxLastError = z.object({
  kind: z.enum(['retry', 'refused-batch', 'refused-sink']),
  status: count.nullable(),
  message: z.string(),
  at: z.number(),
});

export const outboxStatusSchema = z.object({
  sink: z.enum(['pepys', 'none']),
  state: z.enum(['idle', 'sending', 'backing-off', 'blocked', 'off']),
  unsent: count,
  parked: count,
  lag: instantOrNull,
  failingSince: instantOrNull,
  nextTryAt: instantOrNull,
  lastError: outboxLastError.nullable(),
  lastStoredAt: instantOrNull,
});
