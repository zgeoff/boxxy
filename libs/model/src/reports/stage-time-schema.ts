import { z } from 'zod';
import { stageSteps } from './constants.ts';

const stepSchema = z.object({
  step: z.enum(stageSteps),
  minutes: z.number().nullable(),
  endedAt: z.string().nullable(),
});

// The output of the pepys query `boxxy_stage_time`.
export const stageTimeSchema = z.object({
  item: z.string(),
  environment: z.string(),

  // always one per stage step, in the order of `stageSteps`
  steps: z.array(stepSchema),
  rework: z.object({
    count: z.number().int(),
    minutes: z.number(),

    // the sum of `unrelatedLines` over the item's reviews; null when no review recorded one
    unrelatedLines: z.number().int().nullable(),
  }),
  reviewWaitMinutes: z.number().nullable(),
  sleepMinutes: z.number(),
  pullRequests: z.array(z.string()),
});
