import type { HoldNotice, NoticeOutcome, Notifier } from '../ports/types.ts';

export interface FakeNotifier extends Notifier {
  // each notice that was sent, in order
  readonly told: readonly HoldNotice[];

  // the number of calls, sent or failed
  readonly calls: () => number;

  // the next call fails with the reason
  failNext: (reason: string) => void;

  // every call fails with the reason until `recover`
  failAlways: (reason: string) => void;
  recover: () => void;
}

export function createFakeNotifier(): FakeNotifier {
  const told: HoldNotice[] = [];
  let calls = 0;
  let next: string | null = null;
  let always: string | null = null;

  return {
    told,
    calls: () => calls,
    failNext: (reason) => {
      next = reason;
    },
    failAlways: (reason) => {
      always = reason;
    },
    recover: () => {
      always = null;
    },
    tellHold: (notice) => {
      calls += 1;

      const reason = next ?? always;

      next = null;

      if (reason !== null) {
        const failed: NoticeOutcome = { kind: 'failed', reason };

        return Promise.resolve(failed);
      }

      told.push(notice);

      return Promise.resolve({ kind: 'sent' });
    },
  };
}
