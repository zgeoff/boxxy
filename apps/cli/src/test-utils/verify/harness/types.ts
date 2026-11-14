import type { ItemId } from '@boxxy/model';
import type { TestServer } from '@boxxy/server/test-utils/create-test-server';
import type { PepysUnderTest } from '@boxxy/server/test-utils/start-pepys-under-test';
import { z } from 'zod';

// One hold notice that the harness's notifier took: the item, why it holds, and the session it
// went to.
export interface SentNotice {
  readonly item: ItemId;
  readonly reason: string;
  readonly session: string;
}

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

  // the items that `file-peer-item` filed beside the current one; the next current item closes them
  peers: ItemId[];

  // each hold notice that the notifier took, in order
  readonly notices: SentNotice[];

  // the clock when the current item was set, which the minutes of a journey count from
  currentSince: number;

  // the number of the pull request that the last `open-pull-request` opened; null before
  openedPullRequest: number | null;

  // the next pull request number; each opened pull request takes one, so journeys share none
  nextPullRequest: number;
}

// A close-out body by name, one per outcome that moves an item forward.
export const closeOutPresetSchema = z.enum([
  'accepted',
  'needs-owner',
  'designed',
  'built',
  'blocked',
  'passed',
]);

export type CloseOutPreset = z.infer<typeof closeOutPresetSchema>;

const attemptSchema = z.object({
  phase: z.string(),
  state: z.string(),
  outcome: z.string().nullable(),
});

// Only the fields a journey checks.
const derivedSchema = z.object({ state: z.string(), reason: z.string().optional() });
const positionSchema = z.object({ kind: z.string(), reason: z.string().optional() });

const shownItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  derived: derivedSchema,
  position: positionSchema,
});

export const itemShowSchema = z.object({
  item: shownItemSchema,
  attempts: z.array(attemptSchema),
});

const listedItemSchema = z.object({ id: z.string() });
const titledItemSchema = z.object({ id: z.string(), title: z.string() });

export const itemListSchema = z.object({ items: z.array(titledItemSchema) });
export const statusSchema = z.object({ paused: z.boolean() });
export const sessionItemListSchema = z.object({ items: z.array(listedItemSchema) });

export const sessionItemShowSchema = z.object({
  item: z.object({ id: z.string(), title: z.string() }),
});

export const costSchema = z.object({
  totals: z.object({ requests: z.number(), costUSD: z.number() }),
});

const stepSchema = z.object({ step: z.string(), minutes: z.number().nullable() });

export const timesSchema = z.object({ steps: z.array(stepSchema) });
