import type { ClaimStore, Clock, FactSink, Instant, OutboxFact, OutboxStatus } from '@boxxy/model';

export interface OutboxLimits {
  // ingest stores 100 facts of one batch at most
  readonly batchFacts: 100;

  // one fact on the wire: the UTF-8 bytes of its JSON
  readonly factBytes: 262_144;

  // the sum over a batch of (wire bytes + `envelopeBytes` + 8)
  readonly batchBytes: 900_000;

  // what the stored envelope adds to a wire item
  readonly envelopeBytes: 512;
  readonly requestTimeoutMs: 10_000;
  readonly backoff: {
    readonly firstMs: 1000;
    readonly factor: 2;
    readonly maxMs: 300_000;
    readonly jitter: 0.2;
  };
  readonly blockedRetryMs: 300_000;

  // this many rows parked in a row, with none stored between, reads as "pepys refuses everything"
  readonly parkRun: 25;
}

export type TakenBatch =
  | { readonly kind: 'batch'; readonly facts: readonly OutboxFact[] }
  | { readonly kind: 'oversize'; readonly fact: OutboxFact };

export type SenderMove =
  | { readonly kind: 'mark-sent' }
  | { readonly kind: 'retry-same' }
  | { readonly kind: 'split' }
  | { readonly kind: 'park'; readonly reason: string }
  | { readonly kind: 'block'; readonly reason: string };

export type SenderStep = 'idle' | 'stored' | 'retry' | 'split' | 'parked' | 'blocked';

type SenderPhase = 'idle' | 'backing-off' | 'blocked';

type LastError = NonNullable<OutboxStatus['lastError']>;

// What the sender remembers between turns. A restart forgets all of it.
export interface SenderState {
  // batches to send before the next read of the store, in order: the one that got `retry`, or the
  // halves of a split
  readonly queue: readonly (readonly OutboxFact[])[];

  // consecutive `retry` answers
  readonly retries: number;

  // rows parked since the last `stored`
  readonly parkRun: number;
  readonly phase: SenderPhase;
  readonly failingSince: Instant | null;
  readonly nextTryAt: Instant | null;
  readonly lastError: LastError | null;
  readonly lastStoredAt: Instant | null;
}

export interface SenderDeps {
  readonly store: ClaimStore;
  readonly sink: FactSink;
  readonly clock: Clock;
  readonly limits: OutboxLimits;

  // a number in [0, 1), for the jitter of the backoff
  readonly random: () => number;
}

export interface SenderTurn {
  readonly step: SenderStep;
  readonly state: SenderState;
}
