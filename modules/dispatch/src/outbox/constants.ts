import type { OutboxLimits } from './types.ts';

export const outboxLimits: OutboxLimits = {
  batchFacts: 100,
  factBytes: 262_144,

  // One batch is one S2 append, which holds 1,048,576 metered bytes. The rest is margin for S2's
  // JSON request of about 2 MiB, which a body made mostly of quotes reaches at 1 MiB.
  batchBytes: 900_000,
  envelopeBytes: 512,
  requestTimeoutMs: 10_000,
  backoff: { firstMs: 1000, factor: 2, maxMs: 300_000, jitter: 0.2 },
  blockedRetryMs: 300_000,
  parkRun: 25,
};
