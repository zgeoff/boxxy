import type { ItemId } from '@boxxy/model';
import type { TestServer } from '@boxxy/server/test-utils/create-test-server';
import { z } from 'zod';
import type { PepysUnderTest } from '../../start-pepys-under-test.ts';

// What the harness holds for one run. State lives here and in the run folder's store; `down` stops
// the process, and the next `up` starts from nothing.
export interface VerifyHarness extends AsyncDisposable {
  readonly server: TestServer;
  readonly pepys: PepysUnderTest;

  // the value for BOXXY_SKILLS_URL
  readonly skillsURL: string;
  readonly runDirectory: string;

  // the item the last `file-item` or `land-item` filed; null before
  current: ItemId | null;

  // the clock when the current item was set, which the minutes of a journey count from
  currentSince: number;

  // the next pull request number; each opened pull request takes one, so journeys share none
  nextPullRequest: number;
}

// A close-out body by name, one per outcome that moves an item forward.
export const closeOutPresetSchema = z.enum(['accepted', 'designed', 'built', 'passed']);

export type CloseOutPreset = z.infer<typeof closeOutPresetSchema>;

const attemptSchema = z.object({
  phase: z.string(),
  state: z.string(),
  outcome: z.string().nullable(),
});

// Only the fields a journey checks.
export const itemShowSchema = z.object({
  item: z.object({ title: z.string() }),
  attempts: z.array(attemptSchema),
});

export const costSchema = z.object({
  totals: z.object({ requests: z.number(), costUSD: z.number() }),
});

const stepSchema = z.object({ step: z.string(), minutes: z.number().nullable() });

export const timesSchema = z.object({ steps: z.array(stepSchema) });
