interface MCPRequestInput {
  readonly path: '/mcp' | '/mcp/session';

  // the JSON-RPC method, such as `tools/list`
  readonly method: string;
  readonly params: Readonly<Record<string, unknown>>;

  // the bearer token; none when left out
  readonly token?: string;

  // the origin of the request, with its `Host` header, as the public door needs; the owner and
  // worker listeners read neither
  readonly origin?: string;
}

// One JSON-RPC request to an MCP endpoint. The endpoints keep no session, so a request needs no
// `initialize` first.
export function buildMCPRequest(request: MCPRequestInput): Request {
  const headers = new Headers({
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  });

  if (request.token !== undefined) {
    headers.set('authorization', `Bearer ${request.token}`);
  }

  const origin = request.origin ?? 'http://boxxy.test';

  if (request.origin !== undefined) {
    headers.set('host', new URL(origin).host);
  }

  return new Request(`${origin}${request.path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: request.method,
      params: request.params,
    }),
  });
}
