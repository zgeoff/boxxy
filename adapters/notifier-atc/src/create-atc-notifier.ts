import type { HoldNotice, Notifier } from '@boxxy/model';
import type { AtcNotifierOptions } from './types.ts';

// the atc codes of a send that may have run; atc never runs a send again under such a key
const mayHaveRun = new Set(['outcome_unknown', 'idempotency_key_unknown']);

export function createAtcNotifier(options: AtcNotifierOptions): Notifier {
  // by notice key: the tries of the notice that atc answered and refused
  const refusedTries = new Map<string, number>();

  return {
    async tellHold(notice) {
      const noticeKey = buildNoticeKey(notice);
      const tries = refusedTries.get(noticeKey) ?? 0;

      try {
        await options.client.sendMessage({
          session: options.session,
          text: formatHoldMessage(notice),
          idempotencyKey: buildIdempotencyKey(noticeKey, tries),
        });
      } catch (error) {
        const code = findErrorCode(error);

        // atc answers `outcome_unknown` to a key it refused once, so a refused try never repeats
        // its key; a try that atc may have run keeps the key, so atc sends the notice at most once
        if (code !== null && !mayHaveRun.has(code)) {
          refusedTries.set(noticeKey, tries + 1);
        }

        return { kind: 'failed', reason: code ?? 'atc send failed' };
      }

      refusedTries.delete(noticeKey);

      return { kind: 'sent' };
    },
  };
}

// The port's notice has no id or try count; the item, the reason and the time name the notice.
function buildNoticeKey(notice: HoldNotice): string {
  return `boxxy-hold:${notice.item}:${notice.reason}:${notice.at}`;
}

function formatHoldMessage(notice: HoldNotice): string {
  return [
    `boxxy put ${notice.item} on hold: ${notice.reason}.`,
    `Add a note with \`boxxy item note ${notice.item}\`, then run \`boxxy item retry ${notice.item}\`.`,
  ].join('\n');
}

function buildIdempotencyKey(noticeKey: string, refusedTryCount: number): string {
  return refusedTryCount === 0 ? noticeKey : `${noticeKey}:try-${refusedTryCount + 1}`;
}

// Only a string `code` is kept: an error message may carry text that must not reach the log.
function findErrorCode(error: unknown): string | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }

  return null;
}
