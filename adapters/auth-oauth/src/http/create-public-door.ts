import type { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { GrantScope } from '@boxxy/contract';
import { grantScopes } from '@boxxy/contract';
import { DEFAULT_PATHS, openMCPAuth } from '@zgeoff/mcp-auth';
import type { MCPAuth, Requester, ServiceTokenFile } from '@zgeoff/mcp-auth';
import { createMCPHTTPApp } from '@zgeoff/mcp-auth/elysia';
import { createAuthAdmin } from '../auth/create-auth-admin.ts';
import type { AuthAdmin } from '../auth/create-auth-admin.ts';
import { createSecurityEventLog } from '../auth/create-security-event-log.ts';
import { openAuthDatabase } from '../auth/open-auth-database.ts';
import { runAuthMigrations } from '../migrations/run-auth-migrations.ts';
import { serviceTokenPrefix } from '../service-tokens/constants.ts';
import { readServiceTokenFile } from '../service-tokens/read-service-token-file.ts';
import type { ServiceTokenReload } from '../service-tokens/reload-service-tokens.ts';
import { startServiceTokenReloads } from '../service-tokens/start-service-token-reloads.ts';
import type { AuthClock } from '../utils/types.ts';
import { isLoopbackHost } from './is-loopback-host.ts';
import { normalizePublicURL } from './normalize-public-url.ts';
import type { McpServe } from './types.ts';

export interface ServiceTokensOptions {
  readonly file: string;
  readonly onReload: (reload: ServiceTokenReload) => void;
}

export interface PublicDoorOptions {
  // The origin clients reach the door at: the OAuth issuer.
  readonly publicURL: string;

  // The address the door listens on, which decides whether the public URL has to be https.
  readonly hostname: string;
  readonly dbPath: string;

  // The socket peers whose `CF-Connecting-IP` header a security event labels `trusted`, each
  // exactly as the socket reports its address.
  readonly trustForwardedFrom: readonly string[];

  // Receives one JSON line per sign-in outcome or refused token.
  readonly writeSecurityLine: (line: string) => void;

  // Receives a failed sweep of the expired tokens and the sign-ins that never finished.
  readonly onSweepError: (error: unknown) => void;

  // The address of the socket a request came in on, or null.
  readonly readPeer: (request: Request) => string | null;

  // Answers an MCP request whose bearer token verified.
  readonly serveMCP: McpServe;
  readonly clock?: AuthClock;

  // The file of the service clients that sign in with the client_credentials grant. The door reads
  // it at start, and again on each SIGHUP, and reports each reload. With none, the door takes no
  // service client.
  readonly serviceTokens?: ServiceTokensOptions;
}

export interface PublicDoor {
  // Answers a request of the door; it serves nothing but the MCP and OAuth routes.
  readonly answerRequest: (request: Request) => Promise<Response>;

  // The door answers to the loopback address on this port as well as to its public host.
  readonly addLocalPort: (port: number) => void;
  readonly admin: AuthAdmin;

  // The OAuth server itself, for the test helpers that sign a client in.
  readonly auth: MCPAuth<GrantScope>;
  readonly stop: () => Promise<void>;
}

const systemClock: AuthClock = {
  now: () => Date.now(),
  schedule: (callback, delayMs) => {
    const timer = setTimeout(callback, delayMs);

    return () => {
      clearTimeout(timer);
    };
  },
};

// The door serves no path of its own beside the OAuth server's, and no route lives under this.
const NO_APP_PREFIX = '/.boxxy-none';

// Opens and migrates the authorization database and builds the door's routes. Throws on a public
// URL that is neither https nor loopback while the door listens beyond loopback, and on a broken
// service-token file, so a deploy never serves without its service clients.
export async function createPublicDoor(options: PublicDoorOptions): Promise<PublicDoor> {
  const clock = options.clock ?? systemClock;
  const origin = normalizePublicURL(options.publicURL);

  // The door speaks plain HTTP, so a listener other machines can reach sits behind something that
  // terminates TLS, and the public URL clients use is that https origin.
  if (!isLoopbackHost(options.hostname) && !origin.startsWith('https:')) {
    throw new Error(
      `listening on '${options.hostname}' reaches beyond this machine, so the public door needs an https public URL`,
    );
  }

  const security = createSecurityEventLog({ print: options.writeSecurityLine, clock });

  const trustedProxies: ReadonlySet<string> = new Set(options.trustForwardedFrom);

  // The socket's peer is the requester, or the proxy or tunnel in front of the door. Only a listed
  // peer vouches for the forwarded address.
  const readRequester = (request: Request): Requester => {
    const socketAddress = options.readPeer(request);
    const connectingIP = request.headers.get('cf-connecting-ip');

    return {
      socketAddress,
      connectingIP:
        connectingIP === null
          ? null
          : {
              address: connectingIP,
              provenance:
                socketAddress !== null && trustedProxies.has(socketAddress)
                  ? 'trusted'
                  : 'unverified',
            },
      userAgent: request.headers.get('user-agent'),
    };
  };

  const serviceTokens =
    options.serviceTokens === undefined ? null : await readStartFile(options.serviceTokens.file);

  mkdirSync(dirname(options.dbPath), { recursive: true });

  const sqlite = openAuthDatabase(options.dbPath);

  const auth = await openAuth({ sqlite, origin, clock, security, serviceTokens }).catch(
    (error: unknown) => {
      sqlite.close();
      throw error;
    },
  );

  const hosts = new Set<string>([new URL(origin).host]);
  const origins = new Set<string>([origin]);

  const metadataURL = `${origin}${DEFAULT_PATHS.machine.mcpResourceMetadata}`;

  const app = createMCPHTTPApp({
    auth,
    hosts,
    origins,
    readRequester,
    security,
    mcp: {
      // The adapter answers only a request whose bearer token verified, so the header holds one.
      // oxlint-disable-next-line zgeoff/function-verb -- the adapter's option names this method fetch
      fetch: (request, access) =>
        options.serveMCP(request, {
          token:
            /^Bearer (?<token>\S+)$/iu.exec(request.headers.get('authorization') ?? '')?.groups?.[
              'token'
            ] ?? '',
          clientId: access.clientID,
          scopes: [...access.scopes],
          resourceMetadataUrl: metadataURL,
        }),
    },
    besidePrefix: NO_APP_PREFIX,
  });

  const sweep = startSweep(auth, clock, options.onSweepError);

  const stopReloads =
    options.serviceTokens === undefined
      ? () => Promise.resolve()
      : startServiceTokenReloads({
          auth,
          path: options.serviceTokens.file,
          onReload: options.serviceTokens.onReload,
        });

  return {
    answerRequest: (request) => app.handle(request),
    addLocalPort: (port) => {
      hosts.add(`127.0.0.1:${port}`);
      hosts.add(`localhost:${port}`);
      origins.add(`http://127.0.0.1:${port}`);
      origins.add(`http://localhost:${port}`);
    },
    admin: createAuthAdmin({ auth, origin }),
    auth,
    stop: async () => {
      sweep.stop();

      await stopReloads();

      await auth.close();

      sqlite.close();
      security.drain();
    },
  };
}

async function readStartFile(path: string): Promise<ServiceTokenFile<GrantScope>> {
  const parsed = await readServiceTokenFile(path);

  if (!parsed.ok) {
    throw new Error(`the service-token file ${path} is not valid: ${parsed.reason}`);
  }

  return parsed.file;
}

interface AuthOpening {
  readonly sqlite: Database;
  readonly origin: string;
  readonly clock: AuthClock;
  readonly security: ReturnType<typeof createSecurityEventLog>;
  readonly serviceTokens: ServiceTokenFile<GrantScope> | null;
}

async function openAuth(opening: AuthOpening): Promise<MCPAuth<GrantScope>> {
  await runAuthMigrations(opening.sqlite);

  return openMCPAuth({
    database: opening.sqlite,
    origin: opening.origin,
    productName: 'boxxy',
    scopes: grantScopes,
    paths: DEFAULT_PATHS,
    tables: { passkey: 'boxxy_passkey', enrollmentToken: 'boxxy_enrollment_token' },
    clock: opening.clock,
    security: opening.security,
    ...(opening.serviceTokens === null
      ? {}
      : { serviceTokens: { prefix: serviceTokenPrefix, file: opening.serviceTokens } }),

    // Each MCP request builds its own server and holds no stream open, so a revoke has nothing to
    // end beyond the tokens the package deletes.
    onGrantRevoked: () => {},
  });
}

// Each passkey login makes a grant row, which stays until a sweep finds it unfinished an hour on.
const SWEEP_MS = 15 * 60_000;

function startSweep(
  auth: MCPAuth<GrantScope>,
  clock: AuthClock,
  onError: (error: unknown) => void,
): { readonly stop: () => void } {
  let cancel: (() => void) | null = null;
  let isStopped = false;

  const runSweep = async (): Promise<void> => {
    try {
      await auth.removeExpired();
    } catch (error) {
      onError(error);
    }

    if (!isStopped) {
      scheduleNext();
    }
  };

  const scheduleNext = (): void => {
    cancel = clock.schedule(() => {
      void runSweep();
    }, SWEEP_MS);
  };

  scheduleNext();

  return {
    stop: () => {
      isStopped = true;
      cancel?.();
    },
  };
}
