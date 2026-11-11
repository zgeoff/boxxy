import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimNext, settleAttempt } from '@boxxy/dispatch';
import type { SeedItemInput } from '@boxxy/dispatch/test-utils/create-test-dispatch';
import { createTestDispatch } from '@boxxy/dispatch/test-utils/create-test-dispatch';
import { brandSchemas } from '@boxxy/model';
import { createSQLiteClaimStore } from './create-sqlite-claim-store.ts';

export interface ClaimBenchOptions {
  readonly folder: string;
  readonly itemCount: number;
  readonly claimCount: number;

  // every this many items, one stands at a later phase through an `item.retry` lever; 0 for none
  readonly leverEvery: number;
}

export interface ClaimBenchResult {
  readonly claimP50Ms: number;
  readonly claimP99Ms: number;
}

// The time of one `claimNext` call is the time the claim holds the store's lock: the snapshot
// read, the position fold of every open item, the frame, decide, the hash and the writes. The
// close and settle of the claimed item between claims free its seats.
export async function runClaimBench(options: ClaimBenchOptions): Promise<ClaimBenchResult> {
  await using stack = new AsyncDisposableStack();

  const store = await createSQLiteClaimStore(join(options.folder, 'store.db'));

  stack.defer(() => store.close());

  const dispatch = await createTestDispatch({ store });

  const phases = ['triage', 'design', 'build', 'review'].map((phase) =>
    brandSchemas.phaseName.parse(phase),
  );

  for (let index = 0; index < options.itemCount; index += 1) {
    const phase = phases[index % phases.length];
    const isLevered = options.leverEvery > 0 && index % options.leverEvery === 0;
    const input: SeedItemInput = isLevered && phase !== undefined ? { phase } : {};

    await dispatch.seedItem(input);
  }

  const claimTimes: number[] = [];

  for (let index = 0; index < options.claimCount; index += 1) {
    const start = performance.now();

    const claim = await claimNext({
      store,
      runner: dispatch.runner,
      rules: dispatch.rules(),
      now: dispatch.clock.now(),
      newId: dispatch.newId,
      backoff: dispatch.backoff,
      spawn: dispatch.spawn,
    });

    claimTimes.push(performance.now() - start);

    if (claim === null) {
      throw new Error(`claim ${index} picked no item`);
    }

    await dispatch.closeItem(claim.attempt.item, 'benchmark');

    await settleAttempt({
      store,
      attempt: claim.attempt.id,
      forced: null,
      sessionStopped: true,
      rules: dispatch.rules(),
      actor: `boxxy:runner:${dispatch.runner}`,
      now: dispatch.clock.now(),
      newId: dispatch.newId,
    });

    dispatch.clock.advance(1000);
  }

  const sorted = claimTimes.toSorted((left, right) => left - right);

  return { claimP50Ms: pickPercentile(sorted, 0.5), claimP99Ms: pickPercentile(sorted, 0.99) };
}

function pickPercentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)] ?? 0;
}

// bun src/create-sqlite-claim-store.bench.ts <items> <claims> <lever every>
if (import.meta.main) {
  const [itemCount = 20_000, claimCount = 50, leverEvery = 0] = process.argv.slice(2).map(Number);

  const folder = await mkdtemp(join(tmpdir(), 'boxxy-claim-bench-'));

  try {
    const result = await runClaimBench({ folder, itemCount, claimCount, leverEvery });

    process.stdout.write(
      `${itemCount} open items, a lever every ${leverEvery} items: claim lock p50 ${result.claimP50Ms.toFixed(1)} ms, p99 ${result.claimP99Ms.toFixed(1)} ms\n`,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
