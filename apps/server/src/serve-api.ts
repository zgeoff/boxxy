import type { McpServe } from '@boxxy/auth-oauth';
import type { ProcedureName } from '@boxxy/contract';
import { access } from '@boxxy/contract';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { McpRegistrar } from '@orpc/mcp';
import { COMMON_ERROR_STATUS_MAP } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { Elysia } from 'elysia';
import invariant from 'tiny-invariant';
import { isBrowserRequest } from './auth/is-browser-request.ts';
import { pickRequestScope } from './auth/pick-request-scope.ts';
import { pickToolScope } from './auth/pick-tool-scope.ts';
import { api } from './handlers/api.ts';
import { attemptHandlers } from './handlers/attempt-handlers.ts';
import { authHandlers } from './handlers/auth-handlers.ts';
import { itemHandlers } from './handlers/item-handlers.ts';
import { noticesHandlers } from './handlers/notices-handlers.ts';
import { outboxHandlers } from './handlers/outbox-handlers.ts';
import { planHandlers } from './handlers/plan-handlers.ts';
import { relationHandlers } from './handlers/relation-handlers.ts';
import { reportHandlers } from './handlers/report-handlers.ts';
import { rulesHandlers } from './handlers/rules-handlers.ts';
import { runnerHandlers } from './handlers/runner-handlers.ts';
import { readLimitedRequest } from './read-limited-request.ts';
import type { Listener, RequestContext, ServerDeps } from './types.ts';

// the route refuses a larger request body (rule 5 of the contract)
export const maxRequestBytes = 256 * 1024;

// `owner`: the owner's private network, with `/rpc`, `/mcp` and `/healthz`. `worker`: the
// broker's target, with `/rpc` and `/mcp/session`, and the worker token on every request.
export type ApiListeners = ReturnType<typeof serveApi>;

const router = api.router({
  item: itemHandlers,
  relation: relationHandlers,
  attempt: attemptHandlers,
  plan: planHandlers,
  runner: runnerHandlers,
  notices: noticesHandlers,
  outbox: outboxHandlers,
  rules: rulesHandlers,
  auth: authHandlers,
  report: reportHandlers,
});

// In oRPC v2 a typed error's HTTP status comes from this map alone; a code not in it answers 400.
const rpc = new RPCHandler(router, {
  errorStatusMap: {
    ...COMMON_ERROR_STATUS_MAP,
    PEPYS_UNAVAILABLE: 503,
    PEPYS_NOT_CONFIGURED: 501,
    UNKNOWN_PHASE: 422,
    REPO_NOT_CONFIGURED: 422,
    AUTH_NOT_CONFIGURED: 501,
  },
});

const ownerTools = new McpRegistrar(router, {
  filter: (_procedure, path) => getAccess(path).tool === 'owner',
});

// The public door lists the owner tools that have a scope, and no other
const publicTools = new McpRegistrar(router, {
  filter: (_procedure, path) => {
    const row = getAccess(path);

    return row.tool === 'owner' && row.scope !== 'none';
  },
});

const sessionTools = new McpRegistrar(router, {
  filter: (_procedure, path) => getAccess(path).tool === 'session',
});

// One router behind three doors on two listeners. Every request picks its scope from its
// listener and its bearer token before any procedure runs; the root middleware of the router
// then checks the access table for each call.
export function serveApi(deps: ServerDeps) {
  const ownerMcp = makeMcpDoor(deps, 'owner', ownerTools, 'boxxy');
  const sessionMcp = makeMcpDoor(deps, 'worker', sessionTools, 'boxxy-session');

  const owner = new Elysia()
    .get('/healthz', { parse: 'none' }, (route) =>
      handleDoor(deps, 'owner', route.request, () => Promise.resolve(new Response('ok'))),
    )
    .all('/rpc/*', { parse: 'none' }, (route) =>
      handleDoor(deps, 'owner', route.request, (request) => handleRPC(deps, 'owner', request)),
    )
    .all('/mcp', { parse: 'none' }, (route) => handleDoor(deps, 'owner', route.request, ownerMcp));

  const worker = new Elysia()
    .all('/rpc/*', { parse: 'none' }, (route) =>
      handleDoor(deps, 'worker', route.request, (request) => handleRPC(deps, 'worker', request)),
    )
    .all('/mcp/session', { parse: 'none' }, (route) =>
      handleDoor(deps, 'worker', route.request, sessionMcp),
    )

    // the token check also guards a path the listener does not serve, so a caller with no token
    // learns nothing of the routes
    .all('*', { parse: 'none' }, (route) =>
      handleDoor(deps, 'worker', route.request, () => Promise.resolve(answerNotFound())),
    );

  return { owner, worker };
}

function makeMcpDoor(
  deps: ServerDeps,
  listener: Listener,
  registrar: McpRegistrar<typeof router>,
  name: string,
) {
  // one MCP server per request, so the endpoint keeps no session and each call has its request
  const handler = createMcpHandler(async (extra) => {
    const requestInfo = extra.requestInfo;

    invariant(requestInfo !== undefined, 'an HTTP request reaches the MCP door');

    const server = new McpServer({ name, version: '1.0.0' });

    await registrar.register(server, { context: buildContext(deps, listener, requestInfo) });

    return server;
  });

  return (request: Request) => handler.fetch(request);
}

// The door checked the token already; this reads the same scope for the router's context.
function buildContext(deps: ServerDeps, listener: Listener, request: Request): RequestContext {
  const scope = pickRequestScope({
    listener,
    authorization: request.headers.get('authorization'),
    workerTokenDigest: deps.workerTokenDigest,
  });

  invariant(scope !== null, 'the door refuses a request with no scope');

  return { deps, scope, request };
}

function getAccess(path: readonly string[]) {
  const name = path.join('.');

  invariant(isProcedureName(name), `the router serves only contract procedures: ${name}`);

  return access[name];
}

function isProcedureName(name: string): name is ProcedureName {
  return Object.hasOwn(access, name);
}

// The checks of the HTTP request itself: its bearer token, that no browser page sent it, then its
// size. A refusal names nothing of the token.
async function handleDoor(
  deps: ServerDeps,
  listener: Listener,
  request: Request,
  serve: (request: Request) => Promise<Response>,
): Promise<Response> {
  const scope = pickRequestScope({
    listener,
    authorization: request.headers.get('authorization'),
    workerTokenDigest: deps.workerTokenDigest,
  });

  if (scope === null) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (isBrowserRequest(request.headers)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const limited = await readLimitedRequest(request, maxRequestBytes);

  return limited === null
    ? Response.json({ error: 'request body too large' }, { status: 413 })
    : serve(limited);
}

async function handleRPC(deps: ServerDeps, listener: Listener, request: Request) {
  const context = buildContext(deps, listener, request);

  const handled = await rpc.handle(request, { prefix: '/rpc', context });

  return handled.response ?? answerNotFound();
}

function answerNotFound(): Response {
  return Response.json({ error: 'not found' }, { status: 404 });
}

// The owner's MCP tools for the public door. The door verified the bearer token before it calls
// this, so a request runs in the owner's scope; each tool call then needs the scope that the
// access table gives its tool, and a token without it gets 403 with `insufficient_scope`.
export function makePublicMcpServe(readDeps: () => ServerDeps): McpServe {
  const handler = createMcpHandler(async (extra) => {
    const requestInfo = extra.requestInfo;

    invariant(requestInfo !== undefined, 'an HTTP request reaches the MCP door');

    const server = new McpServer({ name: 'boxxy', version: '1.0.0' });

    const registered = await publicTools.register(server, {
      context: { deps: readDeps(), scope: 'owner', request: requestInfo },
    });

    for (const [name, tool] of Object.entries(registered.tools)) {
      const scope = pickToolScope(name);

      invariant(scope !== null, `the public door registered a tool with no scope: ${name}`);

      tool.scopeChallenge = (context) =>
        context.authInfo?.scopes.includes(scope) === true ? undefined : { scopes: [scope] };
    }

    return server;
  });

  return (request, authInfo) => handler.fetch(request, { authInfo });
}
