// Copied from atc: packages/mcp/src/http/answer-mcp-request.ts at commit 4fe647cf.

import type { HTTPServerContext, Requester } from '../auth/types.ts';
import { PUBLIC_DOOR_PATHS } from './public-door-paths.ts';
import { verifyAccessToken } from './verify-access-token.ts';

// What the MCP transport reads of a verified token: the scopes it holds, and the resource metadata
// that a scope challenge points at.
export interface McpAuthInfo {
  readonly token: string;
  readonly clientId: string;
  readonly scopes: string[];
  readonly resourceMetadataUrl: string;
}

// Serves one MCP request for a token that verified.
export type McpServe = (request: Request, authInfo: McpAuthInfo) => Promise<Response>;

// `requester` is where the request came from, for its security events.
export async function answerMCPRequest(
  ctx: HTTPServerContext,
  request: Request,
  requester: Requester,
  serve: McpServe,
): Promise<Response> {
  const path = new URL(request.url).pathname;

  const metadataURL = `${ctx.origin}${PUBLIC_DOOR_PATHS.machine.mcpResourceMetadata}`;
  const authorization = request.headers.get('authorization');
  const token = /^Bearer (?<token>\S+)$/iu.exec(authorization ?? '')?.groups?.['token'];

  if (token === undefined) {
    // a request with no header at all is a client discovering the
    // authorization server, so only a header that holds no bearer token is
    // recorded.
    if (authorization !== null) {
      ctx.security.record({
        kind: 'bearer',
        outcome: 'rejected',
        reason: 'malformed',
        path,
        requester,
      });
    }

    return new Response(null, {
      status: 401,
      headers: { 'www-authenticate': `Bearer resource_metadata="${metadataURL}"` },
    });
  }

  const access = await verifyAccessToken(ctx, token);

  if (access === null) {
    ctx.security.record({
      kind: 'bearer',
      outcome: 'rejected',
      reason: 'invalid_token',
      path,
      requester,
    });

    return new Response(null, {
      status: 401,
      headers: {
        'www-authenticate': `Bearer error="invalid_token", resource_metadata="${metadataURL}"`,
      },
    });
  }

  return serve(request, {
    token,
    clientId: access.clientID,
    scopes: [...access.scopes],
    resourceMetadataUrl: metadataURL,
  });
}
