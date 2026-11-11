import type { ClaimStore, Instant, Notifier } from '@boxxy/model';

export interface SendNoticesInput {
  readonly store: ClaimStore;
  readonly notifier: Notifier;
  readonly now: Instant;
}

// What one tick did with the unsent rows. `stuck` rows have used all their tries.
export interface NoticeReport {
  readonly sent: number;
  readonly failed: number;
  readonly stuck: number;
}
