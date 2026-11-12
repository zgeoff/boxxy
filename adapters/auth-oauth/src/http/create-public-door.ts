// Adapted from atc: packages/mcp/src/http/start-mcp-http-server.ts at commit 4fe647cf.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { APPROVAL_WINDOW_SECONDS } from '../auth/approval-window-seconds.ts';
import { createApprovalState } from '../auth/create-approval-state.ts';
import { createAuthAdmin } from '../auth/create-auth-admin.ts';
import type { AuthAdmin } from '../auth/create-auth-admin.ts';
import { createEnrollmentState } from '../auth/create-enrollment-state.ts';
import { createSecurityEventLog } from '../auth/create-security-event-log.ts';
import { openAuthDatabase } from '../auth/open-auth-database.ts';
import { openMCPAuth } from '../auth/open-mcp-auth.ts';
import type { HTTPServerContext, Requester } from '../auth/types.ts';
import type { AuthClock } from '../utils/types.ts';
import type { McpServe } from './answer-mcp-request.ts';
import { createMCPHTTPApp } from './create-mcp-http-app.ts';
import { isLoopbackHost } from './is-loopback-host.ts';
import { normalizePublicURL } from './normalize-public-url.ts';
import { PUBLIC_DOOR_PATHS } from './public-door-paths.ts';

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

  // The address of the socket a request came in on, or null.
  readonly readPeer: (request: Request) => string | null;

  // Answers an MCP request whose bearer token verified.
  readonly serveMCP: McpServe;
  readonly clock?: AuthClock;
}

export interface PublicDoor {
  // Answers a request of the door; it serves nothing but the MCP and OAuth routes.
  readonly answerRequest: (request: Request) => Promise<Response>;

  // The door answers to the loopback address on this port as well as to its public host.
  readonly addLocalPort: (port: number) => void;
  readonly admin: AuthAdmin;
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

// Opens the authorization database and builds the door's routes. Throws on a public URL that is
// not an https origin, or not a loopback address while the door listens beyond loopback.
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

  mkdirSync(dirname(options.dbPath), { recursive: true });

  const store = await openMCPAuth({
    dbPath: options.dbPath,
    openDatabase: openAuthDatabase,
    origin,
  });

  const hosts = new Set<string>([new URL(origin).host]);
  const origins = new Set<string>([origin]);

  const context: HTTPServerContext = {
    origin,
    resource: `${origin}${PUBLIC_DOOR_PATHS.machine.mcp}`,
    store,
    approvals: createApprovalState(APPROVAL_WINDOW_SECONDS * 1000, () => clock.now()),
    enrollments: createEnrollmentState(() => clock.now()),
    security,
    clock,
  };

  const app = createMCPHTTPApp({
    hosts,
    origins,
    readContext: () => context,
    readRequester,
    serveMCP: options.serveMCP,
    security,
  });

  return {
    answerRequest: (request) => app.handle(request),
    addLocalPort: (port) => {
      hosts.add(`127.0.0.1:${port}`);
      hosts.add(`localhost:${port}`);
      origins.add(`http://127.0.0.1:${port}`);
      origins.add(`http://localhost:${port}`);
    },
    admin: createAuthAdmin({ store, origin, clock }),
    stop: async () => {
      await store.close();

      security.drain();
    },
  };
}
