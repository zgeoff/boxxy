import type { ClaimStore, Instant, Notifier } from '@boxxy/model';

export interface SendNoticesInput {
  readonly store: ClaimStore;
  readonly notifier: Notifier;
  readonly now: Instant;
}

// What one tick did with the due rows. `lastError` is the reason of the last try that was not
// sent, or null when every try was sent.
export interface NoticeReport {
  readonly sent: number;
  readonly failed: number;
  readonly lastError: string | null;
}
