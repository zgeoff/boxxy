import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPublicDoor } from '@boxxy/auth-oauth';
import type { PublicDoor } from '@boxxy/auth-oauth';
import { watchPullRequests } from '@boxxy/dispatch';
import type { WatchReport } from '@boxxy/dispatch';
import type { FakeForge } from '@boxxy/dispatch/test-utils/create-fake-forge';
import { createFakeForge } from '@boxxy/dispatch/test-utils/create-fake-forge';
import type { TestDispatch } from '@boxxy/dispatch/test-utils/create-test-dispatch';
import { createTestDispatch } from '@boxxy/dispatch/test-utils/create-test-dispatch';
import type { ClosableClaimStore } from '@boxxy/dispatch/test-utils/types';
import type {
  AttemptId,
  AttemptRow,
  CallerProof,
  Clock,
  PepysReader,
  PhaseName,
  SessionReading,
} from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import type { FakeNotifier } from '@boxxy/model/test-utils/create-fake-notifier';
import { createFakeNotifier } from '@boxxy/model/test-utils/create-fake-notifier';
import type { FakePepysReader } from '@boxxy/model/test-utils/create-fake-pepys-reader';
import { createFakePepysReader } from '@boxxy/model/test-utils/create-fake-pepys-reader';
import { buildExampleLoadInput } from '@boxxy/rules/test-utils/build-example-load-input';
import invariant from 'tiny-invariant';
import { buildTokenDigest } from '../auth/pick-request-scope.ts';
import { createOffOutbox } from '../outbox/create-off-outbox.ts';
import { buildServerRegistrations } from '../rules/build-server-registrations.ts';
import { makeProposedRulesLoader } from '../rules/load-server-rules.ts';
import { makePublicMcpServe, serveApi } from '../serve-api.ts';
import type { TickReport } from '../tick/run-tick.ts';
import { runTick } from '../tick/run-tick.ts';
import type { NoticeStatus, ServerDeps, ServerLog } from '../types.ts';
import type { FakeCallerProof } from './create-fake-caller-proof.ts';
import { createFakeCallerProof } from './create-fake-caller-proof.ts';

export interface TestServerOptions {
  // false: the server runs as one whose configuration has no pepys section
  readonly hasPepys?: boolean;

  // the server's real proof in place of the fake one, built on the test's clock; the fake that
  // `callerProof` returns then proves nothing
  readonly makeCallerProof?: (clock: Clock) => Promise<CallerProof>;

  // the reader of a pepys under test in place of the fake one, which `pepys` then still returns
  readonly pepys?: PepysReader;

  // the memory store when left out
  readonly store?: ClosableClaimStore;

  // a server that this one replaces, as after a restart: it carries on that server's store, clock
  // and IDs, and builds everything else again, the review gate and the forge among them
  readonly restartOf?: { readonly dispatch: TestDispatch };

  // true: the server also runs a public door, with its auth database in a temp folder
  readonly hasPublicDoor?: boolean;
}

export interface TestServer {
  // the store, clock, worker and rules behind the server, with their seeders
  readonly dispatch: TestDispatch;
  readonly callerProof: FakeCallerProof;
  readonly pepys: FakePepysReader;
  readonly notifier: FakeNotifier;
  readonly forge: FakeForge;

  // the token the worker listener takes
  readonly workerToken: string;

  // what the server logged, in order
  readonly logged: readonly { readonly message: string; readonly fields: unknown }[];
  readonly deps: ServerDeps;

  // the public door and the origin it was made with; null with no public door
  readonly publicDoor: PublicDoor | null;
  readonly publicOrigin: string;

  // the two listeners, as fetch handlers
  readonly owner: (request: Request) => Promise<Response>;
  readonly worker: (request: Request) => Promise<Response>;

  // one runner tick at the clock's time
  readonly tick: () => Promise<TickReport>;

  // one pass of the pull request watch at the clock's time
  readonly watch: () => Promise<WatchReport>;

  // an item at the phase, claimed and started by the fake worker; its row carries the caller
  // that its session reports
  readonly seedStartedAttempt: (phase: PhaseName) => Promise<AttemptRow>;
}

// The server's two listeners on the memory store, the fake worker, the fake clock, a fake pepys
// reader, a fake notifier and a fake forge, with the example rules. No port is opened.
export async function createTestServer(options: TestServerOptions = {}): Promise<TestServer> {
  const dispatchOptions = {
    ...(options.store !== undefined && { store: options.store }),
    ...(options.restartOf !== undefined && { restartOf: options.restartOf.dispatch }),
  };

  const dispatch = await createTestDispatch(dispatchOptions);

  const callerProof = createFakeCallerProof();
  const pepys = createFakePepysReader();
  const notifier = createFakeNotifier();
  const forge = createFakeForge();
  const workerToken = 'test-worker-token';

  const readings = new Map<AttemptId, SessionReading>();

  const noticeStatus: NoticeStatus = { lastError: null };
  const logged: { message: string; fields: unknown }[] = [];

  const log: ServerLog = {
    warn: (message, fields) => {
      logged.push({ message, fields });
    },
  };

  const publicOrigin = 'https://boxxy.test';
  const depsHolder: { current: ServerDeps | null } = { current: null };

  const publicDoor =
    options.hasPublicDoor === true
      ? await startTestPublicDoor(publicOrigin, () => {
          invariant(depsHolder.current !== null, 'the door serves after the deps exist');

          return depsHolder.current;
        })
      : null;

  const deps: ServerDeps = {
    store: dispatch.store,
    runner: dispatch.runner,
    rulesState: () => ({ rules: dispatch.rules(), lastRejected: null }),
    loadProposedRules: makeProposedRulesLoader(
      buildExampleLoadInput().checkout,
      buildServerRegistrations(dispatch.reviewGate),
    ),
    clock: dispatch.clock,
    newId: dispatch.newId,
    callerProof:
      options.makeCallerProof === undefined
        ? callerProof
        : await options.makeCallerProof(dispatch.clock),
    workerTokenDigest: buildTokenDigest(workerToken),
    pepys: options.hasPepys === false ? null : (options.pepys ?? pepys),
    forge,
    review: { gate: dispatch.reviewGate, forge },
    outbox: createOffOutbox(dispatch.store, dispatch.clock),
    repos: new Set(dispatch.spawn.repos.keys()),
    readings,
    noticeStatus,
    log,
    auth: publicDoor?.admin ?? null,
  };

  depsHolder.current = deps;

  const listeners = serveApi(deps);

  return {
    dispatch,
    callerProof,
    pepys,
    notifier,
    forge,
    workerToken,
    logged,
    deps,
    publicDoor,
    publicOrigin,
    owner: (request) => listeners.owner.handle(request),
    worker: (request) => listeners.worker.handle(request),
    tick: () =>
      runTick({
        store: dispatch.store,
        runner: dispatch.runner,
        workers: new Map([
          [
            brandSchemas.workerKindName.parse('atc.session'),
            { shape: 'session', worker: dispatch.worker },
          ],
        ]),
        rules: dispatch.rules(),
        backoff: dispatch.backoff,
        spawn: dispatch.spawn,
        notifier,
        now: dispatch.clock.now(),
        newId: dispatch.newId,
        readings,
        noticeStatus,
        log,
      }),
    watch: () =>
      watchPullRequests({
        store: dispatch.store,
        forge,
        rules: dispatch.rules(),
        runner: dispatch.runner,
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      }),
    seedStartedAttempt: async (phase) => {
      await dispatch.seedItem({ phase });

      const claim = await dispatch.claim();

      invariant(claim !== null, 'the seeded item is claimed');

      return dispatch.readAttempt(claim.attempt.id);
    },
  };
}

async function startTestPublicDoor(
  origin: string,
  readDeps: () => ServerDeps,
): Promise<PublicDoor> {
  const folder = await mkdtemp(join(tmpdir(), 'boxxy-test-door-'));

  const door = await createPublicDoor({
    publicURL: origin,
    hostname: '127.0.0.1',
    dbPath: join(folder, 'auth.db'),
    trustForwardedFrom: [],
    writeSecurityLine: () => {},
    readPeer: () => '127.0.0.1',
    serveMCP: makePublicMcpServe(readDeps),
  });

  onTestFinished(async () => {
    await door.stop();

    await rm(folder, { recursive: true, force: true });
  });

  return door;
}
