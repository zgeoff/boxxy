import type { Notifier } from '@boxxy/model';

// For a configuration that names no notice session: every notice counts as sent.
export function createNullNotifier(): Notifier {
  return { tellHold: () => Promise.resolve({ kind: 'sent' }) };
}
