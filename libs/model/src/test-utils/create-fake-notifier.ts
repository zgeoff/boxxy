import type {
  HoldNotice,
  NoticeOutcome,
  Notifier,
  NotifyNotice,
  PausedNotice,
} from '../ports/types.ts';

export interface FakeNotifier extends Notifier {
  // each hold notice that was sent, in order
  readonly told: readonly HoldNotice[];

  // every hold notice call, sent or not, in order
  readonly attempts: readonly HoldNotice[];

  // each paused-runner notice that was sent, in order
  readonly toldPaused: readonly PausedNotice[];

  // each notify notice that was sent, in order
  readonly toldNotify: readonly NotifyNotice[];

  // the number of calls of any kind, sent or not
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
  const toldNotify: NotifyNotice[] = [];
  let otherCalls = 0;
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
    toldNotify,
    calls: () => attempts.length + otherCalls,
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
      otherCalls += 1;

      const outcome = takeFailure();

      if (outcome !== null) {
        return Promise.resolve(outcome);
      }

      toldPaused.push(notice);

      return Promise.resolve({ kind: 'sent' });
    },
    tellNotify: (notice) => {
      otherCalls += 1;

      const outcome = takeFailure();

      if (outcome !== null) {
        return Promise.resolve(outcome);
      }

      toldNotify.push(notice);

      return Promise.resolve({ kind: 'sent' });
    },
  };
}
