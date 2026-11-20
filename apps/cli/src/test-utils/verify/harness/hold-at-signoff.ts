import { seedSignoffWait } from '@boxxy/dispatch/test-utils/seed-signoff-wait';
import { setCurrentItem } from './set-current-item.ts';
import type { VerifyHarness } from './types.ts';

const minuteMs = 60_000;

// Takes a new item to the sign-off hold, and makes it the current one under the rules that ask for
// a sign-off. Its pull request edits a path that the rules' sign-off rule matches. The open items
// close first, so that the seed's claims take the new item.
export async function holdAtSignoff(
  harness: VerifyHarness,
): Promise<{ item: string; head: string; pullRequest: number }> {
  const dispatch = harness.server.dispatch;
  const number = harness.nextPullRequest;

  harness.nextPullRequest += 1;

  for (const open of [...(harness.current === null ? [] : [harness.current]), ...harness.peers]) {
    await dispatch.closeItem(open, 'the next journey started');
  }

  harness.current = null;
  harness.peers = [];

  const seeded = await seedSignoffWait(dispatch, harness.server.forge, { number });

  const signoffRules = { ...dispatch.rules(), skills: harness.baseRules.skills };

  // the owner answers after the merge attempt ended, so a send-back stays later than it
  dispatch.clock.advance(minuteMs);

  harness.openedPullRequest = number;

  await setCurrentItem(harness, seeded.item, false, signoffRules);

  return { item: seeded.item, head: seeded.head, pullRequest: number };
}
