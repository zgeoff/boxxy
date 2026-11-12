import type { HoldNotice, NoticeOutcome, Notifier } from '../ports/types.ts';

export interface FakeNotifier extends Notifier {
  // each notice that was sent, in order
  readonly told: readonly HoldNotice[];

  // every call, sent or not, in order
  readonly attempts: readonly HoldNotice[];

  // the number of calls, sent or not
  readonly calls: () => number;

  // the next call ends with the outcome
  failNext: (outcome: Exclude<NoticeOutcome, { kind: 'sent' }>) => void;

  // every call ends with the outcome until `recover`
  failAlways: (outcome: Exclude<NoticeOutcome, { kind: 'sent' }>) => void;
  recover: () => void;
}

export function createFakeNotifier(): FakeNotifier {
  const told: HoldNotice[] = [];
  const attempts: HoldNotice[] = [];
  let next: NoticeOutcome | null = null;
  let always: NoticeOutcome | null = null;

  return {
    told,
    attempts,
    calls: () => attempts.length,
    failNext: (outcome) => {
      next = outcome;
    },
    failAlways: (outcome) => {
      always = outcome;
    },
    recover: () => {
      always = null;
    },
    tellHold: (notice) => {
      attempts.push(notice);

      const outcome = next ?? always;

      next = null;

      if (outcome !== null) {
        return Promise.resolve(outcome);
      }

      told.push(notice);

      return Promise.resolve({ kind: 'sent' });
    },
  };
}
