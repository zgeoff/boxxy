import { phaseSteps } from '@boxxy/model';
import type { StageTime } from '@boxxy/model';
import { z } from 'zod';
import { noCapacityFailure, outcomeNames } from './constants.ts';
import type { AttemptReadRow, DeliveryReadRow } from './types.ts';

interface StageParts {
  readonly item: string;
  readonly environment: string;
  readonly attempts: readonly AttemptReadRow[];
  readonly deliveries: readonly DeliveryReadRow[];
}

// How long one item took in each step. A `no-capacity` attempt ran no session, so it is in no
// measure. Every other attempt counts by `ended_at` alone, a `usage-limit`, a lost and an
// unsettleable one too: the time was spent.
export function buildStageTime(parts: StageParts): StageTime {
  const attempts = parts.attempts
    .filter((attempt) => attempt.failure !== noCapacityFailure)
    .map((attempt) => toMeasuredAttempt(attempt));

  const settled = attempts.filter((attempt) => attempt.ended_at !== null);

  const phases = phaseSteps.map((step) =>
    buildPhaseStep(
      step,
      settled.filter((attempt) => attempt.phase === step),
    ),
  );

  return {
    item: parts.item,
    environment: parts.environment,
    steps: [...phases, ...buildDeliverySteps(settled, parts.deliveries)],
    rework: {
      count: settled.filter(
        (attempt) =>
          attempt.phase === 'review' && attempt.outcome === outcomeNames.changesRequested,
      ).length,
      minutes: sumOf(
        settled
          .filter((attempt) => attempt.round > 1)
          .map((attempt) => measureAttemptMinutes(attempt)),
      ),
    },
    reviewWaitMinutes: measureReviewWait(attempts),
    sleepMinutes: sumOf(
      attempts.flatMap((attempt) => attempt.stretches.map((stretch) => measureStretch(stretch))),
    ),
    pullRequests: [...new Set(parts.deliveries.map((delivery) => delivery.pullRequest))].toSorted(),
  };
}

interface SleepStretch {
  readonly from: string;
  readonly to: string | null;
}

interface MeasuredAttempt extends AttemptReadRow {
  readonly stretches: readonly SleepStretch[];
}

function toMeasuredAttempt(attempt: AttemptReadRow): MeasuredAttempt {
  return { ...attempt, stretches: parseSleeps(attempt.sleeps) };
}

const sleepsSchema = z.array(z.object({ from: z.string(), to: z.string().nullable() }));

// A JSON column comes back as text from one store and as the parsed list from another.
function parseSleeps(sleeps: unknown): SleepStretch[] {
  const value: unknown = typeof sleeps === 'string' ? JSON.parse(sleeps) : sleeps;

  return sleepsSchema.parse(value);
}

type Step = StageTime['steps'][number];

// A phase's minutes: the sum, over its settled attempts, of claim to end less the attempt's
// sleep. null when none has settled. Its end is the latest end of the phase.
function buildPhaseStep(
  step: (typeof phaseSteps)[number],
  settled: readonly MeasuredAttempt[],
): Step {
  if (settled.length === 0) {
    return { step, minutes: null, endedAt: null };
  }

  return {
    step,
    minutes: sumOf(settled.map((attempt) => measureAttemptMinutes(attempt))),
    endedAt: findLatest(settled.map((attempt) => attempt.ended_at)),
  };
}

function sumOf(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

function measureAttemptMinutes(attempt: MeasuredAttempt): number {
  const sleptMinutes = sumOf(attempt.stretches.map((stretch) => measureStretch(stretch)));

  return measureMinutes(attempt.claimed_at, attempt.ended_at) - sleptMinutes;
}

// An open stretch counts 0: the query reads no clock.
function measureStretch(stretch: SleepStretch): number {
  return measureMinutes(stretch.from, stretch.to);
}

function measureMinutes(from: string, to: string | null): number {
  return to === null ? 0 : (Date.parse(to) - Date.parse(from)) / 60_000;
}

function findLatest(times: readonly (string | null)[]): string | null {
  return pickTime(times, (left, right) => left > right);
}

function pickTime(
  times: readonly (string | null)[],
  isBetter: (left: number, right: number) => boolean,
): string | null {
  let best: string | null = null;

  for (const time of times) {
    if (time !== null && (best === null || isBetter(Date.parse(time), Date.parse(best)))) {
      best = time;
    }
  }

  return best;
}

// Merge starts at the latest end of a review that passed. A review that settled `unsettleable`
// starts no merge step: boxxy could not read whether it passed. Release and deploy start at the
// step before. An item with two pull requests takes the earliest of each time.
function buildDeliverySteps(
  settled: readonly MeasuredAttempt[],
  deliveries: readonly DeliveryReadRow[],
): Step[] {
  const passed = findLatest(
    settled
      .filter((attempt) => attempt.phase === 'review' && attempt.outcome === outcomeNames.passed)
      .map((attempt) => attempt.ended_at),
  );

  const mergedAt = findEarliest(deliveries.map((delivery) => delivery.mergedAt));
  const releasedAt = findEarliest(deliveries.map((delivery) => delivery.release?.at ?? null));
  const deployedAt = findEarliest(deliveries.map((delivery) => delivery.deploy?.at ?? null));

  return [
    buildDeliveryStep('merge', passed, mergedAt),
    buildDeliveryStep('release', mergedAt, releasedAt),
    buildDeliveryStep('deploy', releasedAt, deployedAt),
  ];
}

function findEarliest(times: readonly (string | null)[]): string | null {
  return pickTime(times, (left, right) => left < right);
}

function buildDeliveryStep(step: Step['step'], from: string | null, to: string | null): Step {
  return {
    step,
    minutes: from === null || to === null ? null : Math.max(0, measureMinutes(from, to)),
    endedAt: to,
  };
}

interface SettledAttempt extends MeasuredAttempt {
  readonly ended_at: string;
}

// For each settled build that was built: the claim of the next review attempt, by number, less
// the build's end. null when no build has a review after it.
function measureReviewWait(attempts: readonly MeasuredAttempt[]): number | null {
  const waits = attempts
    .filter((attempt): attempt is SettledAttempt => attempt.ended_at !== null)
    .filter((build) => build.phase === 'build' && build.outcome === outcomeNames.built)
    .flatMap((build) => {
      const [review] = attempts
        .filter((attempt) => attempt.phase === 'review' && attempt.number > build.number)
        .toSorted((left, right) => left.number - right.number);

      return review === undefined ? [] : [measureMinutes(build.ended_at, review.claimed_at)];
    });

  return waits.length === 0 ? null : sumOf(waits);
}
