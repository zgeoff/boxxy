import type { HoldNotice, Notifier } from '@boxxy/model';
import type { AtcNotifierOptions } from './types.ts';

export function createAtcNotifier(options: AtcNotifierOptions): Notifier {
  return {
    async tellHold(notice) {
      try {
        await options.client.sendMessage({
          session: options.session,
          text: formatHoldMessage(notice),
          idempotencyKey: buildIdempotencyKey(notice),
        });
      } catch (error) {
        return { kind: 'failed', reason: toFailureReason(error) };
      }

      return { kind: 'sent' };
    },
  };
}

function formatHoldMessage(notice: HoldNotice): string {
  return [
    `boxxy put ${notice.item} on hold: ${notice.reason}.`,
    `Add a note with \`boxxy item note ${notice.item}\`, then run \`boxxy item retry ${notice.item}\`.`,
  ].join('\n');
}

// The port's notice has no id or try count; the item, the reason and the time name the notice,
// so a later try of the same notice repeats the key.
function buildIdempotencyKey(notice: HoldNotice): string {
  return `boxxy-hold:${notice.item}:${notice.reason}:${notice.at}`;
}

// Only a string `code` is kept: an error message may carry text that must not reach the log.
function toFailureReason(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }

  return 'atc send failed';
}
