import type { Notifier } from '@boxxy/model';

// For a server with no notice session set: every notice counts as sent.
export function createNullNotifier(): Notifier {
  return { tellHold: () => Promise.resolve({ kind: 'sent' }) };
}
