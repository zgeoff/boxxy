// What `runner.status` shows of the outbox. It has no readonly and plain numbers, because the wire schema
// in `@boxxy/contract` holds plain numbers; a test there keeps the two equal.
export interface OutboxStatus {
  sink: 'pepys' | 'none';
  state: 'idle' | 'sending' | 'backing-off' | 'blocked' | 'off';
  unsent: number;
  parked: number;

  // minutes since the oldest unsent row was written; null when no row is unsent
  lag: number | null;

  // the first answer that was not `stored`, since the last `stored`
  failingSince: number | null;
  nextTryAt: number | null;
  lastError: {
    kind: 'retry' | 'refused-batch' | 'refused-sink';
    status: number | null;
    message: string;
    at: number;
  } | null;
  lastStoredAt: number | null;
}
