interface RPCRequestInput {
  // the procedure as the access table names it, such as `item.get`
  readonly procedure: string;
  readonly input: unknown;

  // the bearer token; none when left out
  readonly token?: string;
}

// A call of one procedure on the oRPC route, as the oRPC client sends it.
export function buildRPCRequest(request: RPCRequestInput): Request {
  const headers = new Headers({ 'content-type': 'application/json' });

  if (request.token !== undefined) {
    headers.set('authorization', `Bearer ${request.token}`);
  }

  return new Request(`http://boxxy.test/rpc/${request.procedure.replace('.', '/')}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ json: request.input }),
  });
}
