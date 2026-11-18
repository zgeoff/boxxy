import type { HoldNotice, NoticeOutcome, Notifier, NotifyNotice, PausedNotice } from '@boxxy/model';
import type { AtcNotifierOptions } from './types.ts';

export function createAtcNotifier(options: AtcNotifierOptions): Notifier {
  return {
    tellHold: (notice) => sendMessage(options, formatHoldMessage(notice), notice.key),
    tellPaused: (notice) => sendMessage(options, formatPausedMessage(notice), notice.key),
    tellNotify: (notice) => sendMessage(options, formatNotifyMessage(notice), notice.key),
  };
}

// the atc codes of a call that ran nothing; every other error may have sent the message
const refusedCodes = new Set([
  'no_such_session',
  'session_dead',
  'unsupported',
  'daemon_unavailable',
  'bad_args',
]);

async function sendMessage(
  options: AtcNotifierOptions,
  text: string,
  idempotencyKey: string,
): Promise<NoticeOutcome> {
  const session = await readSession(options);

  if (session.kind === 'refused') {
    return session;
  }

  try {
    await options.client.sendMessage({ session: session.id, text, idempotencyKey });
  } catch (error) {
    const code = findErrorCode(error);

    if (code !== null && refusedCodes.has(code)) {
      return { kind: 'refused', reason: code };
    }

    return { kind: 'uncertain', reason: code ?? 'atc send failed' };
  }

  return { kind: 'sent' };
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

function formatHoldMessage(notice: HoldNotice): string {
  return [
    `boxxy put ${notice.item} on hold: ${notice.reason}.`,
    `Add a note with \`boxxy item note ${notice.item}\`, then run \`boxxy item retry ${notice.item}\`.`,
  ].join('\n');
}

function formatPausedMessage(notice: PausedNotice): string {
  const hours = Math.floor((notice.at - notice.pausedAt) / 3_600_000);
  const ready = notice.waiting === 1 ? '1 item is' : `${notice.waiting} items are`;

  return [
    `The boxxy runner has been paused for ${hours} hours, by ${notice.pausedBy}. ${ready} ready to claim.`,
    `Reason: ${notice.reason ?? 'none given'}.`,
    'Run `boxxy runner resume` to start claiming again.',
  ].join('\n');
}

function formatNotifyMessage(notice: NotifyNotice): string {
  return [
    `boxxy ended the ${notice.phase} step of ${notice.item} with no session: ${notice.reason}.`,
    `Read the item with \`boxxy item show ${notice.item}\`.`,
  ].join('\n');
}
