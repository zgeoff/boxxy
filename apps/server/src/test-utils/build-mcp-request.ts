interface MCPRequestInput {
  readonly path: '/mcp' | '/mcp/session';

  // the JSON-RPC method, such as `tools/list`
  readonly method: string;
  readonly params: Readonly<Record<string, unknown>>;

  // the bearer token; none when left out
  readonly token?: string;
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

  return new Request(`http://boxxy.test${request.path}`, {
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
