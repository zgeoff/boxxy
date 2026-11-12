import { createNullNotifier, outboxLimits, watchPullRequests } from '@boxxy/dispatch';
import type { SpawnSettings } from '@boxxy/dispatch';
import { createGithubForge } from '@boxxy/forge-github';
import type { AttemptId, GitSource, Notifier, SessionReading } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { createAtcNotifier } from '@boxxy/notifier-atc';
import type { UncheckedQueryClient } from '@boxxy/pepys';
import { createPepysReader } from '@boxxy/pepys/reader';
import { createPepysFactSink } from '@boxxy/pepys/sink';
import { createSQLiteClaimStore } from '@boxxy/store-sqlite';
import type { AtcClient } from '@boxxy/worker-atc';
import { createAtcMcpClient, createAtcWorker } from '@boxxy/worker-atc';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { buildTokenDigest } from './auth/pick-request-scope.ts';
import { pickServerSecrets } from './config/pick-server-secrets.ts';
import { readCallerProof } from './config/read-caller-proof.ts';
import { readServerConfig } from './config/read-server-config.ts';
import type { ServerConfig } from './config/server-config-schema.ts';
import { createCapacityBackoff } from './create-capacity-backoff.ts';
import { createOffOutbox } from './outbox/create-off-outbox.ts';
import type { OutboxSender } from './outbox/start-outbox-sender.ts';
import { startOutboxSender } from './outbox/start-outbox-sender.ts';
import { createRulesHolder } from './rules/create-rules-holder.ts';
import { maxRequestBytes, serveApi } from './serve-api.ts';
import { runTick } from './tick/run-tick.ts';
import { startTickLoop } from './tick/start-tick-loop.ts';
import type { ServerDeps, ServerLog } from './types.ts';

export interface StartServerInput {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly log: ServerLog;
}

export interface RunningServer {
  readonly ownerPort: number;
  readonly workerPort: number;
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

  const rules = await createRulesHolder(config.rules.folder, input.log);

  if (rules.kind !== 'loaded') {
    return { kind: 'refused', message: `the rules did not load: ${JSON.stringify(rules)}` };
  }

  const clock = { now: () => brandSchemas.instant.parse(Date.now()) };

  const proof = await readCallerProof(config.trustedIssuers, clock);

  if (proof.kind === 'refused') {
    return proof;
  }

  const store = await createSQLiteClaimStore(config.store.file);

  const runner = brandSchemas.runnerId.parse(config.runner);

  const atc = createAtcMcpClient({
    url: config.atc.url,
    host: config.atc.host ?? null,
    token: secrets.secrets.atcToken,
    fetch,
    timeoutMs: atcTimeoutMs,
  });

  const worker = createAtcWorker({
    client: atc,
    trustedFolders: config.atc.trustedFolders,
    credentialSources: collectCredentialSources(config.spawn.repos),
  });

  const notifier = buildNotifier(config, atc);

  const pepys = startPepys({
    config,
    secret: secrets.secrets.pepysSigningSecret,
    store,
    clock,
    log: input.log,
  });

  const forge =
    config.github === undefined
      ? null
      : createGithubForge({
          fetch,
          baseUrl: config.github.baseUrl,
          ...(secrets.secrets.githubToken !== null && { token: secrets.secrets.githubToken }),
        });

  const readings = new Map<AttemptId, SessionReading>();

  const holder = rules.holder;

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
    outbox: pepys?.sender ?? createOffOutbox(store, clock),
    repos: new Set(
      Object.keys(config.spawn.repos).map((repo) => brandSchemas.repoName.parse(repo)),
    ),
    readings,
    log: input.log,
  };

  const listeners = serveApi(deps);

  const owner = listeners.owner.listen({
    ...config.api.listen,
    maxRequestBodySize: maxRequestBytes,
  });

  const workerListener = listeners.worker.listen({
    ...config.api.workerListen,
    maxRequestBodySize: maxRequestBytes,
  });

  const backoff = createCapacityBackoff();

  const ticks = startTickLoop({
    runOnce: async () => {
      await holder.reload();

      await runTick({
        store,
        runner,
        worker,
        rules: holder.state().rules,
        backoff,
        spawn: buildSpawnSettings(config, holder.texts()),
        notifier,
        now: clock.now(),
        newId,
        readings,
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
      stop: async () => {
        await ticks.stop();
        await watch?.stop();
        await pepys?.sender.stop();
        await owner.stop();
        await workerListener.stop();
        await store.close();
      },
    },
  };
}

function collectCredentialSources(repos: ServerConfig['spawn']['repos']): GitSource[] {
  return Object.values(repos).filter(
    (checkout): checkout is GitSource =>
      typeof checkout !== 'string' && checkout.credentialRef !== undefined,
  );
}

function buildNotifier(config: ServerConfig, atc: AtcClient): Notifier {
  const session = config.atc.noticeSession;

  if (session === undefined) {
    return createNullNotifier();
  }

  return createAtcNotifier({ client: { sendMessage: atc.sendMessage }, session });
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

function newId(): string {
  return Bun.randomUUIDv7();
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
