import { join } from 'node:path';
import { serveLoopbackDoor } from '@boxxy/server/test-utils/serve-loopback-door';
import { localMCPClient } from '../constants.ts';
import { createVerifyHarness } from './create-verify-harness.ts';
import { serveHarness } from './serve-harness.ts';

// The process that `bun verify up` launches: the harness, its listeners and the public door on
// localhost, and one ready line once they answer. A failure before that exits 1 with the cause on
// stderr. The door reloads its service-token file on SIGHUP, as the deployed server does.
const directory = process.env['BOXXY_VERIFY_DIR'];
const digest = process.env['BOXXY_VERIFY_MCP_DIGEST'];

if (directory === undefined || digest === undefined) {
  console.error('set BOXXY_VERIFY_DIR and BOXXY_VERIFY_MCP_DIGEST; `bun verify up` sets both');
  process.exit(1);
}

try {
  const harness = await createVerifyHarness(directory);
  const listeners = await serveHarness(harness);

  const door = await serveLoopbackDoor({
    folder: join(directory, 'door'),
    client: { name: localMCPClient.name, digest },
    readDeps: () => harness.server.deps,
    onServiceTokenReload: (reload) => {
      console.error(JSON.stringify({ event: 'service-tokens', ...reload }));
    },
  });

  console.log(
    JSON.stringify({
      event: 'listening',
      boxxy: listeners.boxxy,
      control: listeners.control,
      skills: harness.skillsURL,
      mcp: door.origin,
    }),
  );

  const stopped = Promise.withResolvers<null>();

  process.once('SIGTERM', () => {
    stopped.resolve(null);
  });

  await stopped.promise;

  await door.stop();
  await listeners.stop();
  await harness[Symbol.asyncDispose]();

  process.exit(0);
} catch (error) {
  const cause = error instanceof Error ? (error.stack ?? error.message) : String(error);

  console.error(cause);
  process.exit(1);
}
