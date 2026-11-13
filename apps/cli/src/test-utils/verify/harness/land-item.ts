import { postControl } from '../post-control.ts';
import type { VerifyContext } from '../verify-context.ts';
import { controlRoutes } from './control-routes.ts';
import { fileItem } from './file-item.ts';
import { runSession } from './run-session.ts';

interface LandItemInput {
  readonly title: string;
}

// Files an item and takes it to a merge that pepys reports: a build of 30 minutes, a merge 20
// minutes after the review, and model requests of 1 and 2 USD, the numbers that report-cost reads.
export async function landItem(
  ctx: VerifyContext,
  input: LandItemInput,
): Promise<{ item: string; pullRequest: number }> {
  const filed = await fileItem(ctx, input);

  await runSession(ctx, { closeOut: 'accepted', minutes: 4 });
  await runSession(ctx, { closeOut: 'designed', minutes: 10 });

  const opened = await postControl(ctx, controlRoutes.openPullRequest, null);

  const build = await runSession(ctx, {
    closeOut: 'built',
    minutes: 30,
    pullRequest: opened.number,
  });

  const review = await runSession(ctx, { closeOut: 'passed', minutes: 8 });

  await postControl(ctx, controlRoutes.mergePullRequest, {
    number: opened.number,
    afterMinutes: 20,
  });

  await postControl(ctx, controlRoutes.sendTelemetry, {
    requests: [
      { attempt: build.id, minute: 15, costUSD: 1 },
      { attempt: review.id, minute: 45, costUSD: 2 },
    ],
  });

  await postControl(ctx, controlRoutes.drainOutbox, null);

  return { item: filed.item, pullRequest: opened.number };
}
