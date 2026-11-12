import type { NoticeOutcome, NoticeRow } from '@boxxy/model';
import { noticeLimits } from './constants.ts';
import type { NoticeReport, SendNoticesInput } from './types.ts';

// Sends each unsent hold notice through the notifier and counts the try on its row. A notice
// that used `maxTries` stays unsent and is no longer read, so it never holds back a newer one.
// A notifier that throws counts as a failed try; no notice changes an attempt or an item.
export async function sendNotices(input: SendNoticesInput): Promise<NoticeReport> {
  const rows = await input.store.read(async (tx) => ({
    toSend: await tx.listNoticesToSend(noticeLimits.maxTries, noticeLimits.readRows),
    unsent: await tx.listUnsentNotices(noticeLimits.readRows),
  }));

  let sent = 0;
  let failed = 0;

  for (const row of rows.toSend) {
    const outcome = await tellHold(input, row);

    const isSent = outcome.kind === 'sent';

    await input.store.exclusive((tx) => tx.markNoticeTried(row.id, input.now, isSent));

    if (isSent) {
      sent += 1;
    } else {
      failed += 1;
    }
  }

  return {
    sent,
    failed,
    stuck: rows.unsent.filter((candidate) => candidate.tries >= noticeLimits.maxTries).length,
  };
}

async function tellHold(input: SendNoticesInput, row: NoticeRow): Promise<NoticeOutcome> {
  try {
    return await input.notifier.tellHold({ item: row.item, reason: row.reason, at: row.at });
  } catch (error) {
    return { kind: 'failed', reason: error instanceof Error ? error.message : 'notifier threw' };
  }
}
