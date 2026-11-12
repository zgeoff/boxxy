import { access } from '@boxxy/contract';
import type { ProcedureName } from '@boxxy/contract';
import type { TestServer } from '@boxxy/server/test-utils/create-test-server';

// The broker of a deployment, in front of the server's two listeners: a request for a session or
// hook procedure goes to the worker listener with the worker token, and any other request goes to
// the owner listener. The CLI sends no token, as in a session.
export function makeBrokerSend(
  server: Pick<TestServer, 'owner' | 'worker' | 'workerToken'>,
): (request: Request) => Promise<Response> {
  return (request) => {
    const procedure = readProcedure(request);

    if (procedure === null || access[procedure].caller === 'owner') {
      return server.owner(request);
    }

    const headers = new Headers(request.headers);

    headers.set('authorization', `Bearer ${server.workerToken}`);

    return server.worker(new Request(request, { headers }));
  };
}

function readProcedure(request: Request): ProcedureName | null {
  const name = new URL(request.url).pathname.replace(/^\/rpc\//u, '').replaceAll('/', '.');

  return (
    Object.keys(access).find((candidate): candidate is ProcedureName => candidate === name) ?? null
  );
}
