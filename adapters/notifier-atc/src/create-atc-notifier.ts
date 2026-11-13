import type { HoldNotice, NoticeOutcome, Notifier } from '@boxxy/model';
import type { AtcNotifierOptions } from './types.ts';

// the atc codes of a call that ran nothing; every other error may have sent the message
const refusedCodes = new Set([
  'no_such_session',
  'session_dead',
  'unsupported',
  'daemon_unavailable',
  'bad_args',
]);

export function createAtcNotifier(options: AtcNotifierOptions): Notifier {
  return {
    async tellHold(notice) {
      const session = await readSession(options);

      if (session.kind === 'refused') {
        return session;
      }

      try {
        await options.client.sendMessage({
          session: session.id,
          text: formatHoldMessage(notice),
          idempotencyKey: notice.key,
        });
      } catch (error) {
        const code = findErrorCode(error);

        if (code !== null && refusedCodes.has(code)) {
          return { kind: 'refused', reason: code };
        }

        return { kind: 'uncertain', reason: code ?? 'atc send failed' };
      }

      return { kind: 'sent' };
    },
  };
}

type SessionAnswer =
  | { readonly kind: 'found'; readonly id: string }
  | Extract<NoticeOutcome, { kind: 'refused' }>;

// With no session, or with a read that failed, the adapter calls atc for nothing.
async function readSession(options: AtcNotifierOptions): Promise<SessionAnswer> {
  try {
    const id = await options.readSession();

    return id === null ? { kind: 'refused', reason: 'no-notice-session' } : { kind: 'found', id };
  } catch {
    return { kind: 'refused', reason: 'notice-session-unread' };
  }
}

function formatHoldMessage(notice: HoldNotice): string {
  return [
    `boxxy put ${notice.item} on hold: ${notice.reason}.`,
    `Add a note with \`boxxy item note ${notice.item}\`, then run \`boxxy item retry ${notice.item}\`.`,
  ].join('\n');
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
