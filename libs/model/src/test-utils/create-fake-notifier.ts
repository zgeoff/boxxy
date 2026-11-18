import type { HoldNotice, NoticeOutcome, Notifier, PausedNotice } from '../ports/types.ts';

export interface FakeNotifier extends Notifier {
  // each hold notice that was sent, in order
  readonly told: readonly HoldNotice[];

  // every hold notice call, sent or not, in order
  readonly attempts: readonly HoldNotice[];

  // each paused-runner notice that was sent, in order
  readonly toldPaused: readonly PausedNotice[];

  // the number of calls of either kind, sent or not
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
  const toldPaused: PausedNotice[] = [];
  let pausedCalls = 0;
  let next: NoticeOutcome | null = null;
  let always: NoticeOutcome | null = null;

  const takeFailure = (): NoticeOutcome | null => {
    const outcome = next ?? always;

    next = null;

    return outcome;
  };

  return {
    told,
    attempts,
    toldPaused,
    calls: () => attempts.length + pausedCalls,
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

      const outcome = takeFailure();

      if (outcome !== null) {
        return Promise.resolve(outcome);
      }

      told.push(notice);

      return Promise.resolve({ kind: 'sent' });
    },
    tellPaused: (notice) => {
      pausedCalls += 1;

      const outcome = takeFailure();

      if (outcome !== null) {
        return Promise.resolve(outcome);
      }

      toldPaused.push(notice);

      return Promise.resolve({ kind: 'sent' });
    },
  };
}
