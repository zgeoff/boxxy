import type { FakeForge } from '@boxxy/dispatch/test-utils/create-fake-forge';
import { createFakeForge } from '@boxxy/dispatch/test-utils/create-fake-forge';
import type { TestDispatch } from '@boxxy/dispatch/test-utils/create-test-dispatch';
import { createTestDispatch } from '@boxxy/dispatch/test-utils/create-test-dispatch';
import type {
  AttemptId,
  AttemptRow,
  CallerProof,
  Clock,
  PhaseName,
  SessionReading,
} from '@boxxy/model';
import type { FakeNotifier } from '@boxxy/model/test-utils/create-fake-notifier';
import { createFakeNotifier } from '@boxxy/model/test-utils/create-fake-notifier';
import type { FakePepysReader } from '@boxxy/model/test-utils/create-fake-pepys-reader';
import { createFakePepysReader } from '@boxxy/model/test-utils/create-fake-pepys-reader';
import { buildExampleLoadInput } from '@boxxy/rules/test-utils/build-example-load-input';
import invariant from 'tiny-invariant';
import { buildTokenDigest } from '../auth/pick-request-scope.ts';
import { createOffOutbox } from '../outbox/create-off-outbox.ts';
import { makeProposedRulesLoader } from '../rules/load-server-rules.ts';
import { serveApi } from '../serve-api.ts';
import type { TickReport } from '../tick/run-tick.ts';
import { runTick } from '../tick/run-tick.ts';
import type { ServerDeps, ServerLog } from '../types.ts';
import type { FakeCallerProof } from './create-fake-caller-proof.ts';
import { createFakeCallerProof } from './create-fake-caller-proof.ts';

export interface TestServerOptions {
  // false: the server runs as one whose configuration has no pepys section
  readonly hasPepys?: boolean;

  // the server's real proof in place of the fake one, built on the test's clock; the fake that
  // `callerProof` returns then proves nothing
  readonly makeCallerProof?: (clock: Clock) => Promise<CallerProof>;
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

  // the two listeners, as fetch handlers
  readonly owner: (request: Request) => Promise<Response>;
  readonly worker: (request: Request) => Promise<Response>;

  // one runner tick at the clock's time
  readonly tick: () => Promise<TickReport>;

  // an item at the phase, claimed and started by the fake worker; its row carries the caller
  // that its session reports
  readonly seedStartedAttempt: (phase: PhaseName) => Promise<AttemptRow>;
}

// The server's two listeners on the memory store, the fake worker, the fake clock, a fake pepys
// reader, a fake notifier and a fake forge, with the example rules. No port is opened.
export async function createTestServer(options: TestServerOptions = {}): Promise<TestServer> {
  const dispatch = await createTestDispatch();

  const callerProof = createFakeCallerProof();
  const pepys = createFakePepysReader();
  const notifier = createFakeNotifier();
  const forge = createFakeForge();
  const workerToken = 'test-worker-token';

  const readings = new Map<AttemptId, SessionReading>();

  const logged: { message: string; fields: unknown }[] = [];

  const log: ServerLog = {
    warn: (message, fields) => {
      logged.push({ message, fields });
    },
  };

  const deps: ServerDeps = {
    store: dispatch.store,
    runner: dispatch.runner,
    rulesState: () => ({ rules: dispatch.rules(), lastRejected: null }),
    loadProposedRules: makeProposedRulesLoader(buildExampleLoadInput().checkout),
    clock: dispatch.clock,
    newId: dispatch.newId,
    callerProof:
      options.makeCallerProof === undefined
        ? callerProof
        : await options.makeCallerProof(dispatch.clock),
    workerTokenDigest: buildTokenDigest(workerToken),
    pepys: options.hasPepys === false ? null : pepys,
    forge,
    outbox: createOffOutbox(dispatch.store, dispatch.clock),
    readings,
    log,
  };

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
    owner: (request) => listeners.owner.handle(request),
    worker: (request) => listeners.worker.handle(request),
    tick: () =>
      runTick({
        store: dispatch.store,
        runner: dispatch.runner,
        worker: dispatch.worker,
        rules: dispatch.rules(),
        backoff: dispatch.backoff,
        spawn: dispatch.spawn,
        notifier,
        now: dispatch.clock.now(),
        newId: dispatch.newId,
        readings,
        log,
      }),
    seedStartedAttempt: async (phase) => {
      await dispatch.seedItem({ phase });

      const claim = await dispatch.claim();

      invariant(claim !== null, 'the seeded item is claimed');

      return dispatch.readAttempt(claim.attempt.id);
    },
  };
}
