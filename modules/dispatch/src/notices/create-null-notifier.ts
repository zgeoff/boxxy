import type { Notifier } from '@boxxy/model';

// For a server with no notice token set: every notice counts as sent.
export function createNullNotifier(): Notifier {
  return {
    tellHold: () => Promise.resolve({ kind: 'sent' }),
    tellPaused: () => Promise.resolve({ kind: 'sent' }),
    tellNotify: () => Promise.resolve({ kind: 'sent' }),
  };
}
