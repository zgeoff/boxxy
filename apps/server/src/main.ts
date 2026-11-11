import type { RunningServer } from './start-server.ts';
import { startServer } from './start-server.ts';

// The server's entry: `bun apps/server/src/main.ts`. It exits 1 when the server cannot start.
const answer = await startServer({
  env: process.env,
  log: {
    warn: (message, fields) => {
      console.warn(JSON.stringify({ level: 'warn', message, ...fields }));
    },
  },
});

if (answer.kind === 'refused') {
  console.error(answer.message);
  process.exit(1);
}

const server = answer.server;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void stopAndExit(server);
  });
}

async function stopAndExit(running: RunningServer): Promise<void> {
  await running.stop();

  process.exit(0);
}
