import { z } from 'zod';
import { runBoxxy } from '../run-boxxy.ts';
import type { VerifyContext } from '../verify-context.ts';
import { readItemByTitle } from './read-item-by-title.ts';

export type PlanLever = 'expedite' | 'defer' | 'undefer';

interface PlanLeverInput {
  readonly lever: PlanLever;
  readonly title: string;
}

// Runs the owner command of the lever on the open item with the title, through the real CLI.
export async function runPlanLever(ctx: VerifyContext, input: PlanLeverInput): Promise<null> {
  const item = await readItemByTitle(ctx, input.title);

  const reasonFlags = input.lever === 'undefer' ? [] : ['--reason', 'The journey orders the plan.'];

  await runBoxxy(ctx, {
    argv: [input.lever, item, ...reasonFlags],
    schema: z.unknown(),
  });

  return null;
}
