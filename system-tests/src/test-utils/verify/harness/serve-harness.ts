import { makeBrokerSend } from '../../make-broker-send.ts';
import { makeControlHandler } from './make-control-handler.ts';
import type { VerifyHarness } from './types.ts';

export interface HarnessListeners {
  readonly boxxy: string;
  readonly control: string;
  readonly stop: () => Promise<void>;
}

// Serves the harness's two listeners on localhost: `boxxy` is the broker routing in front of the
// server's two listeners, and `control` holds the routes for the steps that only the harness can
// take. The control routes serve nothing else.
export async function serveHarness(harness: VerifyHarness): Promise<HarnessListeners> {
  const routes = makeControlHandler(harness);
  const health = routes['/control/health']?.GET;

  if (health === undefined) {
    throw new Error('the control routes have no health route');
  }

  const answer = await health(new Request('http://control.test/control/health'));

  if (answer.status !== 200) {
    throw new Error(`the health route answered ${answer.status}: ${await answer.text()}`);
  }

  const boxxy = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: makeBrokerSend(harness.server),
  });

  const control = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    routes,
    fetch: answerNotFound,
  });

  return {
    boxxy: `http://127.0.0.1:${String(boxxy.port)}`,
    control: `http://127.0.0.1:${String(control.port)}`,
    stop: async () => {
      await boxxy.stop();
      await control.stop();
    },
  };
}

function answerNotFound(): Response {
  return new Response('not found', { status: 404 });
}
