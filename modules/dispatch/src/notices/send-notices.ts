import type { Instant, NoticeOutcome, NoticeRow, NoticeTryUpdate } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { noticeLimits } from './constants.ts';
import type { NoticeReport, SendNoticesInput } from './types.ts';

// Sends each due hold notice through the notifier and updates the row once per try. A row that
// atc has not taken waits for its next try, with no cap on the tries. A notifier that throws
// counts as an uncertain try; no notice changes an attempt or an item.
export async function sendNotices(input: SendNoticesInput): Promise<NoticeReport> {
  const due = await input.store.read((tx) => tx.listNoticesDue(input.now, noticeLimits.readRows));

  let sent = 0;
  let failed = 0;
  let lastError: string | null = null;

  for (const row of due) {
    const outcome = await tellHold(input, row);

    await input.store.exclusive((tx) =>
      tx.markNoticeTried(row.id, buildNoticeTry(row, outcome, input.now)),
    );

    if (outcome.kind === 'sent') {
      sent += 1;
    } else {
      failed += 1;
      lastError = outcome.reason;
    }
  }

  return { sent, failed, lastError };
}

async function tellHold(input: SendNoticesInput, row: NoticeRow): Promise<NoticeOutcome> {
  try {
    return await input.notifier.tellHold({
      item: row.item,
      reason: row.reason,
      at: row.at,
      key: buildNoticeKey(row),
    });
  } catch (error) {
    return {
      kind: 'uncertain',
      reason: error instanceof Error ? error.message : 'notifier threw',
    };
  }
}

function buildNoticeKey(row: NoticeRow): string {
  return `boxxy-notice:${row.id}:${row.keySeq}`;
}

function buildNoticeTry(row: NoticeRow, outcome: NoticeOutcome, now: Instant): NoticeTryUpdate {
  const nextTryAt = buildNextTryAt(row.tries + 1, now);

  if (outcome.kind === 'sent') {
    return { sentAt: now, keySeq: row.keySeq, keyTries: row.keyTries, nextTryAt };
  }

  // atc answers any later call under a refused key without sending, so a first refusal takes a new key
  if (outcome.kind === 'refused' && row.keyTries === 0) {
    return { sentAt: null, keySeq: row.keySeq + 1, keyTries: 0, nextTryAt };
  }

  const keyTries = row.keyTries + 1;

  if (keyTries >= noticeLimits.uncertainTriesPerKey) {
    return { sentAt: null, keySeq: row.keySeq + 1, keyTries: 0, nextTryAt };
  }

  return { sentAt: null, keySeq: row.keySeq, keyTries, nextTryAt };
}

// 5 s after the first try, doubling up to 15 min
function buildNextTryAt(tries: number, now: Instant): Instant {
  const doublings = Math.min(tries - 1, 30);
  const waitMs = Math.min(noticeLimits.firstWaitMs * 2 ** doublings, noticeLimits.longestWaitMs);

  return brandSchemas.instant.parse(now + waitMs);
}
