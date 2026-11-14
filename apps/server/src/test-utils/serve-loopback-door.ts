import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPublicDoor } from '@boxxy/auth-oauth';
import type { ServiceTokenReload } from '@boxxy/auth-oauth';
import { makePublicMcpServe, maxRequestBytes } from '../serve-api.ts';
import { servePublicDoor } from '../serve-public-door.ts';
import type { ServerDeps } from '../types.ts';

export interface LoopbackDoorOptions {
  // the auth database and the service-token file go here
  readonly folder: string;

  // the one service client: its name and the sha256 digest of its secret; it holds both scopes
  readonly client: { readonly name: string; readonly digest: string };
  readonly readDeps: () => ServerDeps;
  readonly onServiceTokenReload: (reload: ServiceTokenReload) => void;
}

export interface LoopbackDoor {
  // the door's origin, its OAuth issuer, at a port the system picked
  readonly origin: string;
  readonly serviceTokensFile: string;
  readonly stop: () => Promise<void>;
}

// The public door on a loopback port, as a deployment serves it, with a service-token file that
// names one client. The door's public URL must name its port, so the listener starts first, and
// answers once the door exists.
export async function serveLoopbackDoor(options: LoopbackDoorOptions): Promise<LoopbackDoor> {
  const answer: { current: ((request: Request) => Promise<Response>) | null } = { current: null };

  const listener = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    maxRequestBodySize: maxRequestBytes,
    // oxlint-disable-next-line zgeoff/function-verb -- Bun.serve names its handler fetch
    fetch: (request) =>
      answer.current === null
        ? new Response('the door is starting', { status: 503 })
        : answer.current(request),
  });

  const origin = `http://127.0.0.1:${String(listener.port)}`;
  const serviceTokensFile = join(options.folder, 'service-tokens.json');

  try {
    await mkdir(options.folder, { recursive: true, mode: 0o700 });
    await writeServiceTokenFile(serviceTokensFile, origin, options.client);

    const door = await createPublicDoor({
      publicURL: origin,
      hostname: '127.0.0.1',
      dbPath: join(options.folder, 'auth.db'),
      trustForwardedFrom: [],
      writeSecurityLine: (line) => {
        process.stderr.write(`${line}\n`);
      },
      onSweepError: (error) => {
        process.stderr.write(`the door did not sweep: ${String(error)}\n`);
      },
      readPeer: (request) => listener.requestIP(request)?.address ?? null,
      serveMCP: makePublicMcpServe(options.readDeps),
      serviceTokens: { file: serviceTokensFile, onReload: options.onServiceTokenReload },
    });

    const app = servePublicDoor(door);

    answer.current = (request) => app.handle(request);

    return {
      origin,
      serviceTokensFile,
      stop: async () => {
        await listener.stop(true);
        await door.stop();
      },
    };
  } catch (error) {
    await listener.stop(true);

    throw error;
  }
}

// The file holds the digest alone, never the secret, and only its owner reads it.
async function writeServiceTokenFile(
  path: string,
  origin: string,
  client: LoopbackDoorOptions['client'],
): Promise<void> {
  const file = {
    resource: `${origin}/mcp`,
    clients: { [client.name]: { scopes: ['read', 'write'], secretDigests: [client.digest] } },
  };

  // Bun.write ignores its mode option for a string, which would leave the file readable by all
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
}
