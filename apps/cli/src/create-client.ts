import type { BoxxyClient } from '@boxxy/contract';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { UsageError } from './cli/usage-error.ts';
import { envNames } from './constants.ts';
import type { CLIDeps } from './types.ts';

// The typed client of the server's RPC route. It sends no token and no identity header: on the
// owner's path the listener needs none, and in a session the broker adds both on the way out. The
// client uses the platform's fetch unless a test passes `send`.
export function createClient(deps: CLIDeps): BoxxyClient {
  const address = deps.env[envNames.url];

  if (address === undefined || address === '') {
    throw new UsageError(`${envNames.url} is not set`);
  }

  const target = parseServerAddress(address);

  const link = new RPCLink({
    origin: target.origin,
    url: target.url,
    ...makeLinkOptions(deps.send),
  });

  return createORPCClient<BoxxyClient>(link);
}

function parseServerAddress(address: string): { origin: string; url: `/${string}` } {
  const parsed = URL.parse(address);

  if (parsed === null || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
    throw new UsageError(`${envNames.url} is not an http or https address`);
  }

  const route = `${parsed.pathname.replace(/\/+$/u, '')}/rpc`.replace(/^\/+/u, '');

  return { origin: parsed.origin, url: `/${route}` };
}

// the link sends through the platform's fetch unless it is given another way to send
function makeLinkOptions(send: CLIDeps['send']) {
  if (send === undefined) {
    return {};
  }

  const sendRequest = (url: string, init: RequestInit) => send(new Request(url, init));

  return { fetch: sendRequest };
}
