import { dirname, join } from 'node:path';
import { createPublicDoor } from '@boxxy/auth-oauth';
import type { PublicDoor } from '@boxxy/auth-oauth';
import {
  createMergeJob,
  createNullNotifier,
  outboxLimits,
  watchPullRequests,
} from '@boxxy/dispatch';
import type { SpawnSettings } from '@boxxy/dispatch';
import { createGithubAppAuth, createGithubForge } from '@boxxy/forge-github';
import type { GithubAppKeys } from '@boxxy/forge-github';
import type {
  AttemptId,
  ClaimStore,
  Forge,
  GitSource,
  Notifier,
  SessionReading,
  WorkerKindName,
  WorkerRegistry,
  WorkerShape,
} from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { createAtcNotifier } from '@boxxy/notifier-atc';
import type { UncheckedQueryClient } from '@boxxy/pepys';
import { createPepysReader } from '@boxxy/pepys/reader';
import { createPepysFactSink } from '@boxxy/pepys/sink';
import { createNoslopReviewGate } from '@boxxy/review-noslop';
import { createSQLiteClaimStore } from '@boxxy/store-sqlite';
import { createWringerVerifier } from '@boxxy/verifier-wringer';
import { createAtcMcpClient, createAtcWorker } from '@boxxy/worker-atc';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import invariant from 'tiny-invariant';
import { buildTokenDigest } from './auth/pick-request-scope.ts';
import { pickServerSecrets } from './config/pick-server-secrets.ts';
import { readCallerProof } from './config/read-caller-proof.ts';
import { readServerConfig } from './config/read-server-config.ts';
import type { ServerConfig } from './config/server-config-schema.ts';
import { verifyGateCheck } from './constants.ts';
import { createCapacityBackoff } from './create-capacity-backoff.ts';
import { formatErrorChain } from './format-error-chain.ts';
import { makeNoticeSessionRead } from './make-notice-session-read.ts';
import { createOffOutbox } from './outbox/create-off-outbox.ts';
import type { OutboxSender } from './outbox/start-outbox-sender.ts';
import { startOutboxSender } from './outbox/start-outbox-sender.ts';
import {
  atcWorkerName,
  buildServerRegistrations,
  mergeWorkerName,
} from './rules/build-server-registrations.ts';
import { createRulesHolder } from './rules/create-rules-holder.ts';
import { makePublicMcpServe, maxRequestBytes, serveApi } from './serve-api.ts';
import { servePublicDoor } from './serve-public-door.ts';
import { runTick } from './tick/run-tick.ts';
import { startTickLoop } from './tick/start-tick-loop.ts';
import type { NoticeStatus, ServerDeps, ServerLog } from './types.ts';

export interface StartServerInput {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly log: ServerLog;

  // receives one JSON line for each sign-in outcome and each refused token of the public door;
  // stderr when left out
  readonly writeSecurityLine?: (line: string) => void;
}

export interface RunningServer {
  readonly ownerPort: number;
  readonly workerPort: number;

  // null: the configuration has no public door
  readonly publicPort: number | null;
  readonly stop: () => Promise<void>;
}

export type StartAnswer =
  | { readonly kind: 'started'; readonly server: RunningServer }

  // the server did not start; the message names no secret value
  | { readonly kind: 'refused'; readonly message: string };

const tickMs = 5000;
const atcTimeoutMs = 30_000;
const watchMs = 5 * 60 * 1000;

// Reads the configuration and the secrets, loads the rules, opens the store, builds the adapters,
// starts both listeners, the runner tick, the pull request watch and the outbox sender.
export async function startServer(input: StartServerInput): Promise<StartAnswer> {
  const configPath = input.env['BOXXY_CONFIG'] ?? '';

  if (configPath === '') {
    return { kind: 'refused', message: 'set BOXXY_CONFIG to the path of the configuration file' };
  }

  const read = await readServerConfig(configPath);

  if (read.kind === 'invalid') {
    return { kind: 'refused', message: read.message };
  }

  const config = read.config;
  const secrets = pickServerSecrets(config, input.env);

  if (secrets.kind === 'missing') {
    return { kind: 'refused', message: `set these variables: ${secrets.names.join(', ')}` };
  }

  if (secrets.kind === 'malformed') {
    return { kind: 'refused', message: `set ${secrets.name} to ${secrets.expected}` };
  }

  if (secrets.kind === 'retired') {
    return { kind: 'refused', message: `unset ${secrets.name}: ${secrets.instead}` };
  }

  // The review session runs the command on an agent host, which never gets the App's keys; the
  // server uses them only to check and post the result.
  const reviewGate = createNoslopReviewGate({ appEnv: secrets.secrets.review ?? {} });

  const atc = createAtcMcpClient({
    url: config.atc.url,
    host: config.atc.host ?? null,
    token: secrets.secrets.atcToken,
    fetch,
    timeoutMs: atcTimeoutMs,
  });

  const forge =
    config.github === undefined
      ? null
      : buildForge(config.github.baseUrl, secrets.secrets.githubApp);

  const clock = { now: () => brandSchemas.instant.parse(Date.now()) };

  const proof = await readCallerProof(config.trustedIssuers, clock);

  if (proof.kind === 'refused') {
    return proof;
  }

  const store = await createSQLiteClaimStore(config.store.file);

  const workers: WorkerRegistry = new Map([
    [
      atcWorkerName,
      {
        shape: 'session',
        worker: createAtcWorker({
          client: atc,
          trustedFolders: config.atc.trustedFolders,
          credentialSources: collectCredentialSources(config.spawn.repos),
        }),
      },
    ],
    ...buildMergeWorker(forge, store),
  ]);

  const rules = await createRulesHolder(
    config.rules,
    input.log,
    buildServerRegistrations(reviewGate, config.spawn.reviewAgents, [...workers.keys()]),
  );

  if (rules.kind !== 'loaded') {
    await store.close();

    return { kind: 'refused', message: `the rules did not load: ${JSON.stringify(rules)}` };
  }

  const runner = brandSchemas.runnerId.parse(config.runner);
  const notifier = buildNotifier(config, secrets.secrets.noticeToken, store);

  const pepys = startPepys({
    config,
    secret: secrets.secrets.pepysSigningSecret,
    store,
    clock,
    log: input.log,
  });

  const readings = new Map<AttemptId, SessionReading>();

  const noticeStatus: NoticeStatus = { lastError: null };
  const holder = rules.holder;

  // the door needs the deps to serve MCP, and the deps hold the door's admin, so the door reads
  // them when a request arrives
  const depsHolder: { current: ServerDeps | null } = { current: null };

  const doorStart = await startPublicDoor(config, input, () => {
    invariant(depsHolder.current !== null, 'a request reached the public door before the deps');

    return depsHolder.current;
  });

  if (doorStart.kind === 'refused') {
    await store.close();

    return doorStart;
  }

  const door = doorStart.door;

  const deps: ServerDeps = {
    store,
    runner,
    rulesState: holder.state,
    loadProposedRules: holder.loadProposed,
    clock,
    newId,
    callerProof: proof.callerProof,
    workerTokenDigest: buildTokenDigest(secrets.secrets.workerToken),
    pepys: pepys?.reader ?? null,
    forge,
    review: secrets.secrets.review === null || forge === null ? null : { gate: reviewGate, forge },
    outbox: pepys?.sender ?? createOffOutbox(store, clock),
    repos: new Set(
      Object.keys(config.spawn.repos).map((repo) => brandSchemas.repoName.parse(repo)),
    ),
    readings,
    noticeStatus,
    log: input.log,
    auth: door?.admin ?? null,
  };

  depsHolder.current = deps;

  const listeners = serveApi(deps);

  const owner = listeners.owner.listen({
    ...config.api.listen,
    maxRequestBodySize: maxRequestBytes,
  });

  const workerListener = listeners.worker.listen({
    ...config.api.workerListen,
    maxRequestBodySize: maxRequestBytes,
  });

  const publicListener = door === null ? null : listenPublicDoor(door, doorStart.peers, config);
  const backoff = createCapacityBackoff();

  const ticks = startTickLoop({
    runOnce: async () => {
      await holder.reload();

      await runTick({
        store,
        runner,
        workers,
        rules: holder.state().rules,
        backoff,
        spawn: buildSpawnSettings(config, holder.texts()),
        notifier,
        now: clock.now(),
        newId,
        readings,
        noticeStatus,
        log: input.log,
      });
    },
    intervalMs: tickMs,
    failureMessage: 'the runner tick failed',
    log: input.log,
  });

  const watch =
    forge === null
      ? null
      : startTickLoop({
          runOnce: async () => {
            const report = await watchPullRequests({
              store,
              forge,
              rules: holder.state().rules,
              runner,
              now: clock.now(),
              newId,
            });

            if (report.unanswered > 0) {
              input.log.warn('the forge did not answer the pull request watch', { ...report });
            }
          },
          intervalMs: watchMs,
          failureMessage: 'the pull request watch failed',
          log: input.log,
        });

  return {
    kind: 'started',
    server: {
      ownerPort: owner.server?.port ?? 0,
      workerPort: workerListener.server?.port ?? 0,
      publicPort: publicListener?.server?.port ?? null,
      stop: async () => {
        await ticks.stop();
        await watch?.stop();
        await pepys?.sender.stop();
        await owner.stop();
        await workerListener.stop();
        await publicListener?.stop();
        await door?.stop();
        await store.close();
      },
    },
  };
}

// With the App's keys, every forge call sends the App's installation token, which reads check
// runs on a private repo where a fine-grained token gets 403. Without them, the forge sends no
// credential, for a broker that adds it on the way out.
function buildForge(baseUrl: string, app: GithubAppKeys | null): Forge {
  if (app === null) {
    return createGithubForge({ fetch, baseUrl });
  }

  const auth = createGithubAppAuth({ keys: app, baseUrl, fetch, nowMs: () => Date.now() });

  return createGithubForge({ fetch, baseUrl, readToken: auth.readToken });
}

function collectCredentialSources(repos: ServerConfig['spawn']['repos']): GitSource[] {
  return Object.values(repos).filter(
    (checkout): checkout is GitSource =>
      typeof checkout !== 'string' && checkout.credentialRef !== undefined,
  );
}

// The merge reads the pull request, its checks and the verify gate through the forge, so a server
// with no `github` section builds no merge worker, and the loader refuses a merge step.
function buildMergeWorker(forge: Forge | null, store: ClaimStore): [WorkerKindName, WorkerShape][] {
  if (forge === null) {
    return [];
  }

  const verifier = createWringerVerifier({ forge, gateCheck: verifyGateCheck });

  return [[mergeWorkerName, { shape: 'job', worker: createMergeJob({ forge, verifier, store }) }]];
}

// The notifier gets an atc client of its own, with the notice token: the worker token never
// reaches the owner's machine, where the notice session runs. With no notice token, every notice
// counts as sent.
function buildNotifier(config: ServerConfig, token: string | null, store: ClaimStore): Notifier {
  if (token === null) {
    return createNullNotifier();
  }

  const client = createAtcMcpClient({
    url: config.atc.url,
    host: config.atc.host ?? null,
    token,
    fetch,
    timeoutMs: atcTimeoutMs,
  });

  return createAtcNotifier({
    client: { sendMessage: client.sendMessage },
    readSession: makeNoticeSessionRead(store),
  });
}

interface PepysWiring {
  readonly reader: ReturnType<typeof createPepysReader>;
  readonly sender: OutboxSender;
}

interface PepysInput {
  readonly config: ServerConfig;
  readonly secret: string | null;
  readonly store: ServerDeps['store'];
  readonly clock: ServerDeps['clock'];
  readonly log: ServerLog;
}

const pepysTimeoutMs = 10_000;
const outboxIdleMs = 5000;

// null: the configuration has no pepys section
function startPepys(input: PepysInput): PepysWiring | null {
  const config = input.config;
  const secret = input.secret;

  if (config.pepys === undefined || secret === null) {
    return null;
  }

  const client = createORPCClient<UncheckedQueryClient>(
    new RPCLink(toLinkTarget(config.pepys.apiUrl)),
  );

  const reader = createPepysReader({
    client,
    environment: config.pepys.environment,
    timeoutMs: pepysTimeoutMs,
  });

  const sink = createPepysFactSink({
    url: config.pepys.ingestUrl,
    secret,
    timeoutMs: pepysTimeoutMs,
  });

  const sender = startOutboxSender({
    store: input.store,
    sink,
    clock: input.clock,
    limits: outboxLimits,
    random: Math.random,
    idleMs: outboxIdleMs,
    log: input.log,
  });

  return { reader, sender };
}

// oRPC's link takes the origin apart from the route's path
function toLinkTarget(address: string): { origin: string; url: `/${string}` } {
  const parsed = new URL(address);

  return { origin: parsed.origin, url: `/${parsed.pathname.replace(/^\/+/u, '')}` };
}

// where the door reads the address of a request's socket, once its listener runs
interface PeerSource {
  current: { readonly requestIP: (request: Request) => { readonly address: string } | null } | null;
}

type DoorStart =
  | { readonly kind: 'ready'; readonly door: PublicDoor | null; readonly peers: PeerSource }
  | { readonly kind: 'refused'; readonly message: string };

// null door: the configuration has no public door section
async function startPublicDoor(
  config: ServerConfig,
  input: StartServerInput,
  readDeps: () => ServerDeps,
): Promise<DoorStart> {
  const section = config.publicDoor;
  const peers: PeerSource = { current: null };

  if (section === undefined) {
    return { kind: 'ready', door: null, peers };
  }

  const writeSecurityLine =
    input.writeSecurityLine ??
    ((line: string) => {
      process.stderr.write(`${line}\n`);
    });

  try {
    const door = await createPublicDoor({
      publicURL: section.publicURL,
      hostname: section.hostname,
      dbPath: section.authFile ?? join(dirname(config.store.file), 'boxxy-auth.db'),
      trustForwardedFrom: section.trustForwardedFrom,
      writeSecurityLine,
      readPeer: (request) => peers.current?.requestIP(request)?.address ?? null,
      serveMCP: makePublicMcpServe(readDeps),
    });

    return { kind: 'ready', door, peers };
  } catch (error) {
    return {
      kind: 'refused',
      message: `the public door did not start: ${formatErrorChain(error)}`,
    };
  }
}

function newId(): string {
  return Bun.randomUUIDv7();
}

function listenPublicDoor(door: PublicDoor, peers: PeerSource, config: ServerConfig) {
  const section = config.publicDoor;

  invariant(section !== undefined, 'a door runs only with a public door section');

  const listener = servePublicDoor(door).listen({
    hostname: section.hostname,
    port: section.port,
    maxRequestBodySize: maxRequestBytes,
  });

  peers.current = listener.server ?? null;

  door.addLocalPort(listener.server?.port ?? section.port);

  return listener;
}

function buildSpawnSettings(
  config: ServerConfig,
  prompts: ReadonlyMap<string, string>,
): SpawnSettings {
  return {
    target: config.spawn.target,
    repos: new Map(
      Object.entries(config.spawn.repos).map(([repo, checkout]) => [
        brandSchemas.repoName.parse(repo),
        checkout,
      ]),
    ),
    prompts,
  };
}
