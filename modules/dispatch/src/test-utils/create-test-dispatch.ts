import { createReviewPhase, phaseKinds } from '@boxxy/closeout';
import type {
  ApplyResult,
  AtcSessionId,
  AttemptId,
  AttemptRow,
  CallerIdentity,
  CapacityBackoff,
  Claim,
  FactType,
  ItemId,
  LoadedRules,
  NewId,
  OutboxFact,
  PipelineStep,
  RunnerId,
} from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockGateReading } from '@boxxy/model/test-utils/build-mock-gate-reading';
import { conceptPins, concepts } from '@boxxy/planning';
import { loadRules } from '@boxxy/rules';
import { buildExampleLoadInput } from '@boxxy/rules/test-utils/build-example-load-input';
import invariant from 'tiny-invariant';
import { endItemAttempts } from '../attempts/end-item-attempts.ts';
import { writeAttemptMove } from '../attempts/write-attempt-move.ts';
import { claimNext } from '../claims/claim-next.ts';
import { resumeClaim } from '../claims/resume-claim.ts';
import { startClaim } from '../claims/start-claim.ts';
import type { SpawnSettings } from '../claims/types.ts';
import { closeOutAttempt } from '../closeouts/close-out-attempt.ts';
import { settleAttempt } from '../closeouts/settle-attempt.ts';
import type { CallRef } from '../closeouts/types.ts';
import { linkPullRequest } from '../pull-requests/link-pull-request.ts';
import { actOnReading } from '../readings/act-on-reading.ts';
import { pickReadingAction } from '../readings/pick-reading-action.ts';
import { buildMockNewId } from './build-mock-new-id.ts';
import type { SeedItemInput } from './build-seed-item-change.ts';
import { buildSeedItemChange } from './build-seed-item-change.ts';
import { createFakeBackoff } from './create-fake-backoff.ts';
import type { FakeClock } from './create-fake-clock.ts';
import { createFakeClock } from './create-fake-clock.ts';
import type { FakeForge } from './create-fake-forge.ts';
import type { FakeReviewGate } from './create-fake-review-gate.ts';
import { createFakeReviewGate } from './create-fake-review-gate.ts';
import type { FakeWorker } from './create-fake-worker.ts';
import { createFakeWorker } from './create-fake-worker.ts';
import { createMemoryClaimStore } from './create-memory-claim-store.ts';
import type { ClosableClaimStore } from './types.ts';

export type { SeedItemInput } from './build-seed-item-change.ts';

export interface ReworkInput {
  // the caller that the item's kept session holds; the first build's caller when left out
  readonly keptCaller?: CallerIdentity | null;

  // the worker's wake starts the second build on the kept session; when left out, the test does
  readonly startByWorker?: boolean;
}

export interface Rework {
  readonly first: AttemptRow;

  // the second build as its claim wrote it, and after its start
  readonly claimed: AttemptRow;
  readonly second: AttemptRow;

  // the body of the first build's close-out
  readonly firstBody: unknown;
}

export interface TestDispatch {
  readonly store: ClosableClaimStore;
  readonly clock: FakeClock;
  readonly worker: FakeWorker;

  // the gate that the review phase kind of the rules is built on
  readonly reviewGate: FakeReviewGate;
  readonly backoff: CapacityBackoff;
  readonly newId: NewId;
  readonly runner: RunnerId;
  readonly spawn: SpawnSettings;
  readonly rules: () => LoadedRules;
  readonly setRules: (rules: LoadedRules) => void;

  // the claim loop and the readings of one runner tick, as the server's tick runs them
  readonly tick: () => Promise<void>;

  // one claim, started or resumed; null when `decide` gives no pick
  readonly claim: () => Promise<Claim | null>;
  readonly seedItem: (input: SeedItemInput) => Promise<ItemId>;

  // a build that closed out as `built` and settled, so it succeeded; its session is kept
  readonly seedBuild: () => Promise<AttemptRow>;

  // the same, with the build's session first linking the open pull request of the example repo
  // with this number, which the test's forge then holds
  readonly seedBuildWithPullRequest: (forge: FakeForge, number: number) => Promise<AttemptRow>;

  // A build that settled `built` with its session kept, a review that asked for changes, and
  // the claim of the second build through the `resume: true` edge, started on the kept session
  // as the resume of the kept session starts it.
  readonly seedRework: (input: ReworkInput) => Promise<Rework>;

  // after `seedBuild`: a review asks for changes, and the worker starts the rework on the kept session
  readonly seedReworkAfter: (first: AttemptRow) => Promise<AttemptRow>;

  // the change of `item.close`: the item's close and the ends of its live attempts
  readonly closeItem: (item: ItemId, reason: string) => Promise<ApplyResult>;
  readonly readAttempt: (id: AttemptId) => Promise<AttemptRow>;

  // in name order
  readonly heldSeats: (attempt: AttemptId) => Promise<string[]>;
  readonly listFacts: (type: FactType) => Promise<OutboxFact[]>;

  // what the edge gives the core for a call from the attempt's own session
  readonly buildCallRef: (attempt: AttemptRow) => CallRef;
}

const repo = brandSchemas.repoName.parse('example/app');

export interface TestDispatchOptions {
  // the memory store when left out
  readonly store?: ClosableClaimStore;

  // a dispatch whose store, clock and IDs this one carries on, as a server does after a restart
  readonly restartOf?: TestDispatch;
}

// The example rules with the four phase kinds, the store with its limits synced, the fake
// worker, and a clock that moves only when the test moves it.
export async function createTestDispatch(options: TestDispatchOptions = {}): Promise<TestDispatch> {
  const store = options.restartOf?.store ?? options.store ?? createMemoryClaimStore();
  const clock = options.restartOf?.clock ?? createFakeClock();
  const worker = createFakeWorker({ clock });
  const backoff = createFakeBackoff();
  const newId = options.restartOf?.newId ?? buildMockNewId();
  const runner = brandSchemas.runnerId.parse('runner-1');
  const example = buildExampleLoadInput();
  const reviewGate = createFakeReviewGate();
  const phases = [...phaseKinds, createReviewPhase(reviewGate)];
  const loaded = loadRules({ ...example, concepts, pins: conceptPins, phases });

  invariant(loaded.kind === 'loaded', 'the example rules load');

  let rules = loaded.rules;

  const decoder = new TextDecoder();

  const spawn: SpawnSettings = {
    target: 'worker-host',
    repos: new Map([[repo, '/tmp/boxxy-test/app']]),
    prompts: new Map(
      [...example.checkout.files].map(([path, bytes]) => [path, decoder.decode(bytes)]),
    ),
  };

  await store.exclusive((tx) => tx.syncLimits(rules.limits, clock.now()));

  const claim = async (): Promise<Claim | null> => {
    const now = clock.now();
    const deps = { store, worker, rules, backoff, now, newId };

    const picked = await claimNext({ ...deps, runner, spawn });

    if (picked?.kind === 'start') {
      await startClaim({ ...deps, claim: picked });
    }

    if (picked?.kind === 'wake') {
      await resumeClaim({ ...deps, claim: picked });
    }

    return picked;
  };

  const dispatch: TestDispatch = {
    store,
    clock,
    worker,
    reviewGate,
    backoff,
    newId,
    runner,
    spawn,
    seedBuild: async () => {
      const built = await seedBuiltAttempt(dispatch);

      return dispatch.readAttempt(built.first.id);
    },
    seedBuildWithPullRequest: async (forge, number) => {
      const built = await seedBuiltAttempt(dispatch, { forge, number });

      return dispatch.readAttempt(built.first.id);
    },
    seedRework: (input) => seedReworkAttempts(dispatch, input),
    seedReworkAfter: async (first) => {
      await requestChanges(dispatch, first.item);

      const resumed = await claimResumed(dispatch, first, { startByWorker: true });

      return resumed.second;
    },
    rules: () => rules,
    setRules: (next) => {
      rules = next;
    },
    claim,
    tick: async () => {
      const claimed = new Set<ItemId>();

      try {
        for (let picked = await claim(); picked !== null; picked = await claim()) {
          if (claimed.has(picked.attempt.item)) {
            break;
          }

          claimed.add(picked.attempt.item);
        }
      } catch {
        // an error in the claim loop ends the loop, not the tick
      }

      const now = clock.now();

      const live = await store.read((tx) => tx.listLiveAttempts());

      for (const attempt of live) {
        const reading = await worker.reconcile(attempt);
        const step = await readAttemptStep(store, rules, attempt);

        const action = pickReadingAction({ attempt, reading, step, sleep: rules.sleep, now });

        await actOnReading({ store, worker, rules, backoff, attempt, reading, action, now, newId });
      }
    },
    seedItem: async (input) => {
      const seeded = buildSeedItemChange(newId, clock.now(), input);

      await store.exclusive((tx) => tx.applyChange(seeded.change));

      // a lever orders after an attempt that ends at the same instant, so time moves on
      clock.advance(1000);

      return seeded.row.id;
    },
    closeItem: (item, reason) =>
      store.exclusive(async (tx) => {
        const attempts = await tx.listItemAttempts(item);

        const now = clock.now();
        const actor = 'boxxy:owner:local';
        const ended = endItemAttempts({ attempts, actor, now, newId });

        return tx.applyChange({
          at: now,
          under: ended.under,
          writes: [
            ...ended.writes,
            {
              op: 'update',
              table: 'items',
              key: { id: item },
              expect: { closedAt: null },
              set: { closedAt: now, closeReason: reason },
            },
          ],
          facts: [
            ...ended.facts,
            {
              id: brandSchemas.factId.parse(newId()),
              type: 'boxxy.item.closed',
              entity: `boxxy:item:${item}`,
              actor,
              payload: { reason, byAttempt: null, ended: ended.ended },
            },
          ],
        });
      }),
    readAttempt: async (id) => {
      const row = await store.read((tx) => tx.readAttempt(id));

      invariant(row !== null, `the test reads a stored attempt: ${id}`);

      return row;
    },
    heldSeats: async (attempt) => {
      const seats = await store.read((tx) => tx.listLimitSeats());

      return seats
        .filter((seat) => seat.attempt === attempt)
        .map((seat) => seat.limit)
        .toSorted((first, second) => first.localeCompare(second));
    },
    listFacts: async (type) => {
      const facts = await store.read((tx) => tx.readUnsentFacts(10_000));

      return facts.filter((fact) => fact.type === type);
    },
    buildCallRef: (attempt) => {
      invariant(attempt.atcSession !== null, 'a call comes from a started session');

      const caller: CallerIdentity = {
        issuer: 'fake-worker',
        subject: attempt.atcSession,
      };

      return { attempt: attempt.id, session: attempt.atcSession, caller };
    },
  };

  return dispatch;
}

interface PullRequestLinkSeed {
  readonly forge: FakeForge;
  readonly number: number;
}

// A build that claimed, closed out as `built` and settled; its session is kept.
async function seedBuiltAttempt(
  dispatch: TestDispatch,
  link: PullRequestLinkSeed | null = null,
): Promise<{ item: ItemId; first: AttemptRow; firstBody: unknown }> {
  const item = await dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });
  const first = await claimStarted(dispatch, item);

  if (link !== null) {
    await linkSeededPullRequest(dispatch, first, link);
  }

  const evidence = brandSchemas.factId.parse(dispatch.newId());
  const now = dispatch.clock.now();

  await dispatch.store.exclusive((tx) =>
    tx.applyChange({
      at: now,
      writes: [
        {
          op: 'insert',
          table: 'evidence',
          row: {
            factId: evidence,
            attempt: first.id,
            kind: 'test',
            ref: 'bun test',
            observed: 'pass',
            source: 'agent',
            at: now,
          },
        },
      ],
      facts: [
        {
          id: evidence,
          type: 'boxxy.evidence.recorded',
          entity: `boxxy:item:${item}`,
          actor: `boxxy:attempt:${first.id}`,
          payload: { attempt: first.id, kind: 'test', ref: 'bun test', observed: 'pass' },
        },
      ],
    }),
  );

  const firstBody = {
    result: { kind: 'built' },
    criteria: [{ criterion: 'a1', evidence }],
    openItems: [],
    friction: [],
  };

  await closeAndSettle(dispatch, first, firstBody);

  return { item, first, firstBody };
}

async function claimStarted(dispatch: TestDispatch, item: ItemId): Promise<AttemptRow> {
  const claim = await dispatch.claim();

  invariant(claim?.attempt.item === item, 'the claim picks the seeded item');

  return dispatch.readAttempt(claim.attempt.id);
}

// The build's session links an open pull request of the example repo, which the forge holds.
async function linkSeededPullRequest(
  dispatch: TestDispatch,
  build: AttemptRow,
  link: PullRequestLinkSeed,
): Promise<void> {
  link.forge.seed({
    ref: { repo, number: link.number },
    githubId: 9_000_000 + link.number,
    reading: { state: 'open', mergedAt: null, mergeCommit: null, commits: [] },
  });

  const linked = await linkPullRequest({
    store: dispatch.store,
    forge: link.forge,
    rules: dispatch.rules(),
    call: dispatch.buildCallRef(build),
    url: `https://github.com/${repo}/pull/${link.number}`,
    now: dispatch.clock.now(),
    newId: dispatch.newId,
  });

  invariant(linked.kind === 'linked', `the seeded pull request links: ${JSON.stringify(linked)}`);
}

async function closeAndSettle(dispatch: TestDispatch, attempt: AttemptRow, body: unknown) {
  const base = { store: dispatch.store, rules: dispatch.rules(), newId: dispatch.newId };
  const now = dispatch.clock.now();

  const answer = await closeOutAttempt({
    ...base,
    call: dispatch.buildCallRef(attempt),
    body,
    now,
  });

  invariant(answer.kind === 'recorded', `the seeded close-out records: ${JSON.stringify(answer)}`);

  dispatch.clock.advance(1000);

  await settleAttempt({
    ...base,
    attempt: attempt.id,
    forced: null,
    sessionStopped: true,
    actor: `boxxy:runner:${dispatch.runner}`,
    now: dispatch.clock.now(),
  });

  dispatch.clock.advance(1000);
}

async function seedReworkAttempts(dispatch: TestDispatch, input: ReworkInput): Promise<Rework> {
  const built = await seedBuiltAttempt(dispatch);

  const item = built.item;
  const first = built.first;
  const firstBody = built.firstBody;

  if (input.keptCaller !== undefined) {
    await dispatch.store.exclusive(async (tx) => {
      const view = await tx.readItem(item, dispatch.clock.now(), dispatch.rules());

      const kept = view?.keptSession;

      invariant(
        kept !== null && kept !== undefined,
        'the settle of the first build keeps its session',
      );

      return tx.applyChange({
        at: dispatch.clock.now(),
        writes: [
          {
            op: 'update',
            table: 'items',
            key: { id: item },
            expect: { keptSession: kept },
            set: { keptSession: { ...kept, caller: input.keptCaller ?? null } },
          },
        ],
        facts: [],
      });
    });
  }

  await requestChanges(dispatch, item);

  return {
    first: await dispatch.readAttempt(first.id),
    firstBody,
    ...(await claimResumed(dispatch, first, input)),
  };
}

// The review of the item claims, asks for changes and settles.
async function requestChanges(dispatch: TestDispatch, item: ItemId): Promise<void> {
  const review = await claimStarted(dispatch, item);

  await closeAndSettle(dispatch, review, {
    round: 1,
    cause: 'first',
    reading: buildMockGateReading({
      status: 'blocked',
      why: 'open-findings',
      open: { high: 1, medium: 0, low: 0 },
      findingPaths: ['src/theme.ts'],
    }),
    unrelatedLines: null,
  });
}

// The claim only, then the `started` that the resume of the kept session records.
async function claimResumed(
  dispatch: TestDispatch,
  first: AttemptRow,
  input: ReworkInput,
): Promise<Pick<Rework, 'claimed' | 'second'>> {
  if (input.startByWorker === true) {
    const started = await dispatch.claim();

    invariant(started?.kind === 'start', 'the rework claims');

    const attempt = await dispatch.readAttempt(started.attempt.id);

    return { claimed: started.attempt, second: attempt };
  }

  const now = dispatch.clock.now();

  const claim = await claimNext({
    store: dispatch.store,
    runner: dispatch.runner,
    rules: dispatch.rules(),
    now,
    newId: dispatch.newId,
    backoff: dispatch.backoff,
    spawn: dispatch.spawn,
  });

  invariant(claim?.kind === 'start' && claim.attempt.phase === first.phase, 'the rework claims');

  await dispatch.store.exclusive((tx) =>
    writeAttemptMove(
      tx,
      claim.attempt.id,
      {
        kind: 'started',
        via: 'start',
        atcSession: getSession(first),
        caller: claim.attempt.caller,
        resumeFallback: false,
      },
      { actor: `boxxy:runner:${dispatch.runner}`, now, newId: dispatch.newId },
    ),
  );

  return { claimed: claim.attempt, second: await dispatch.readAttempt(claim.attempt.id) };
}

function getSession(attempt: AttemptRow): AtcSessionId {
  invariant(attempt.atcSession !== null, 'a started attempt has a session');

  return attempt.atcSession;
}

async function readAttemptStep(
  store: ClosableClaimStore,
  rules: LoadedRules,
  attempt: AttemptRow,
): Promise<PipelineStep | null> {
  const item = await store.read((tx) => tx.readItem(attempt.item, attempt.claimedAt, rules));

  const pipeline = item === null ? undefined : rules.kinds.get(item.kind)?.pipeline;

  return pipeline?.steps.find((step) => step.phase === attempt.phase) ?? null;
}
