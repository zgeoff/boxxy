// Copied from atc: packages/mcp/src/http/read-token-access.ts at commit 4fe647cf.

import { grantScopes } from '@boxxy/contract';
import type { GrantScope } from '@boxxy/contract';
import { isAPIError } from 'better-auth/api';
import type { HTTPServerContext } from '../auth/types.ts';
import { isRecord } from '../utils/is-record.ts';

interface TokenAccess {
  readonly clientID: string;
  readonly scopes: readonly GrantScope[];
}

// An inactive, unknown, expired or revoked token, one bound to another
// resource, or one without a client id reads as null. Reading records no use.
export async function readTokenAccess(
  ctx: HTTPServerContext,
  token: string,
): Promise<TokenAccess | null> {
  let payload: unknown;

  try {
    payload = await ctx.store.auth.api.verifyMCPAccessToken({ body: { token } });
  } catch (error) {
    if (isAPIError(error)) {
      return null;
    }

    throw error;
  }

  if (!isRecord(payload) || ![payload['aud']].flat().includes(ctx.resource)) {
    return null;
  }

  const granted = typeof payload['scope'] === 'string' ? payload['scope'].split(' ') : [];
  const clientID = typeof payload['client_id'] === 'string' ? payload['client_id'] : '';

  if (clientID === '') {
    return null;
  }

  return { clientID, scopes: grantScopes.filter((scope) => granted.includes(scope)) };
}
