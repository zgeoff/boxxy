// Copied from atc: packages/mcp/src/http/create-mcp-http-app.ts at commit 4fe647cf.

import { Elysia } from 'elysia';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { answerAuthorizeRequest } from '../auth/answer-authorize-request.ts';
import { answerConsentRequest } from '../auth/answer-consent-request.ts';
import { answerEnrollRequest } from '../auth/answer-enroll-request.ts';
import { answerLoginRequest } from '../auth/answer-login-request.ts';
import { recordRefusedExchange } from '../auth/record-refused-exchange.ts';
import type { HTTPServerContext, Requester, SecurityEvent } from '../auth/types.ts';
import { isRecord } from '../utils/is-record.ts';
import { answerMCPRequest } from './answer-mcp-request.ts';
import type { McpServe } from './answer-mcp-request.ts';
import { buildPageResponse } from './build-page-response.ts';
import { pickErrorMessage } from './pick-error-message.ts';
import { PUBLIC_DOOR_PATHS } from './public-door-paths.ts';

interface MCPHTTPAppOptions {
  // The Host header values the server answers to.
  readonly hosts: ReadonlySet<string>;

  // The origins a browser form or an MCP request may come from.
  readonly origins: ReadonlySet<string>;

  // The routes' context once the authorization server's database is open,
  // and null before.
  readonly readContext: () => HTTPServerContext | null;

  // Where a request came from, for its security events.
  readonly readRequester: (request: Request) => Requester;

  // Answers an MCP request whose bearer token verified.
  readonly serveMCP: McpServe;

  // Receives each refused Host or origin.
  readonly security: { readonly record: (event: SecurityEvent) => void };
}

// The browser pages: passkey sign-in, passkey enrollment, and consent.
// the part of Elysia's context that the routes read
interface RouteContext {
  readonly request: Request;
}

const PAGE_PATHS = [
  PUBLIC_DOOR_PATHS.browser.login,
  PUBLIC_DOOR_PATHS.browser.enroll,
  PUBLIC_DOOR_PATHS.browser.consent,
] as const;

// Both paths serve the protected resource metadata for `<origin>/mcp`.
const RESOURCE_METADATA_PATHS = [
  PUBLIC_DOOR_PATHS.machine.resourceMetadata,
  PUBLIC_DOOR_PATHS.machine.mcpResourceMetadata,
] as const;

export function createMCPHTTPApp(options: MCPHTTPAppOptions) {
  const requireContext = (): HTTPServerContext => {
    const ctx = options.readContext();

    invariant(ctx, 'a route ran before the authorization server opened');

    return ctx;
  };

  const app = new Elysia()
    .onRequest((context: RouteContext) => {
      const path = new URL(context.request.url).pathname;

      const host = context.request.headers.get('host');

      if (host === null || !options.hosts.has(host)) {
        options.security.record({
          kind: 'authorize_invalid',
          outcome: 'rejected',
          reason: 'bad_host',
          path,
          requester: options.readRequester(context.request),
        });

        return new Response(null, { status: 403 });
      }

      // Elysia answers with any value a hook returns but undefined, null included
      return options.readContext() === null ? new Response(null, { status: 503 }) : undefined;
    })
    .onError(() => new Response(null, { status: 503 }))
    .post(PUBLIC_DOOR_PATHS.machine.revoke, (context: RouteContext) =>
      requireContext().store.auth.handler(toPublicRequest(requireContext(), context.request)),
    )
    .get(PUBLIC_DOOR_PATHS.machine.authorizationServerMetadata, (context: RouteContext) =>
      answerMetadataRequest(requireContext(), context.request, 'authorization-server'),
    )
    .get(PUBLIC_DOOR_PATHS.browser.authorize, (context: RouteContext) =>
      answerAuthorizeRequest(
        requireContext(),
        new URL(context.request.url),
        options.readRequester(context.request),
      ),
    )
    .post(PUBLIC_DOOR_PATHS.machine.token, (context: RouteContext) =>
      answerTokenRequest(requireContext(), context.request, options.readRequester(context.request)),
    )
    .get(PUBLIC_DOOR_PATHS.browser.error, (context: RouteContext) => {
      const error = new URL(context.request.url).searchParams.get('error');

      return buildPageResponse(400, { message: pickErrorMessage(error) });
    });

  for (const path of RESOURCE_METADATA_PATHS) {
    app.get(path, (context: RouteContext) =>
      answerMetadataRequest(requireContext(), context.request, 'resource'),
    );
  }

  for (const path of PAGE_PATHS) {
    app.get(path, (context: RouteContext) =>
      answerPageRequest(requireContext(), {
        path,
        request: context.request,
        body: '',
        requester: options.readRequester(context.request),
      }),
    );

    app.post(
      path,
      {
        // a form posts from the server's own pages, so a post with no origin
        // or another one is a forged form
        beforeHandle: (context: RouteContext) => {
          const origin = context.request.headers.get('origin');
          const isForged = origin === null || !options.origins.has(origin);

          if (isForged) {
            recordBadOrigin(options, context.request);
          }

          return isForged
            ? buildPageResponse(403, { message: 'The form came from an unexpected origin.' })
            : undefined;
        },
      },
      async (context: RouteContext) => {
        const body = await context.request.text();

        return answerPageRequest(requireContext(), {
          path,
          request: context.request,
          body,
          requester: options.readRequester(context.request),
        });
      },
    );
  }

  app.all(
    PUBLIC_DOOR_PATHS.machine.mcp,
    {
      beforeHandle: (context: RouteContext) => {
        const origin = context.request.headers.get('origin');
        const isForeign = origin !== null && !options.origins.has(origin);

        if (isForeign) {
          recordBadOrigin(options, context.request);
        }

        return isForeign ? new Response(null, { status: 403 }) : undefined;
      },
    },
    (context: RouteContext) => {
      if (context.request.method !== 'POST') {
        return new Response(null, { status: 405, headers: { allow: 'POST' } });
      }

      return answerMCPRequest(
        requireContext(),
        context.request,
        options.readRequester(context.request),
        options.serveMCP,
      );
    },
  );

  // every other path, the RPC route and the health check included, answers 404
  app.all('*', () => new Response(null, { status: 404 }));

  return app;
}

// better-auth builds every URL it returns from its base URL, so a request
// that reached the local address is handed over as if it came to the public
// origin.
function toPublicRequest(ctx: HTTPServerContext, request: Request): Request {
  const url = new URL(request.url);

  return new Request(`${ctx.origin}${url.pathname}${url.search}`, request);
}

// The metadata advertises only what boxxy's clients can use: public clients
// with no client authentication, no introspection endpoint, and Bearer
// tokens alone, so nothing about DPoP.
async function answerMetadataRequest(
  ctx: HTTPServerContext,
  request: Request,
  kind: 'authorization-server' | 'resource',
): Promise<Response> {
  const response = await ctx.store.auth.handler(toPublicRequest(ctx, request));
  const metadata: unknown = await response.json();

  if (!isRecord(metadata)) {
    return new Response(null, { status: 503 });
  }

  const advertised = Object.fromEntries(
    Object.entries(metadata).filter(
      ([key]) => !key.startsWith('introspection_') && !key.startsWith('dpop_'),
    ),
  );

  if (kind === 'resource') {
    return Response.json(advertised, { status: response.status });
  }

  return Response.json({
    ...advertised,
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
  });
}

// better-auth binds a code exchange's tokens to the owner session that approved it.
async function answerTokenRequest(
  ctx: HTTPServerContext,
  request: Request,
  requester: Requester,
): Promise<Response> {
  // the body is read once here, so the refusal's event can name its client.
  const body = await request.text();

  const sent = new Request(request.url, { method: request.method, headers: request.headers, body });

  const response = await ctx.store.auth.handler(toPublicRequest(ctx, sent));

  if (!response.ok) {
    await recordRefusedExchange(ctx, {
      contentType: request.headers.get('content-type'),
      body,
      response,
      path: new URL(request.url).pathname,
      requester,
    });

    return response;
  }

  const attached = await ctx.store.db
    .selectFrom('oauthAccessToken')
    .select('sessionId')
    .where('sessionId', 'is not', null)
    .union(
      ctx.store.db
        .selectFrom('oauthRefreshToken')
        .select('sessionId')
        .where('sessionId', 'is not', null),
    )
    .execute();

  const sessionIDs = attached.flatMap((row) => (row.sessionId === null ? [] : [row.sessionId]));

  // detached tokens outlive their session, so a session's end never ends a grant.
  await ctx.store.db
    .updateTable('oauthAccessToken')
    .set({ sessionId: null })
    .where('sessionId', 'is not', null)
    .execute();

  await ctx.store.db
    .updateTable('oauthRefreshToken')
    .set({ sessionId: null })
    .where('sessionId', 'is not', null)
    .execute();

  const now = new Date(ctx.clock.now()).toISOString();

  // the session's one authorization is done.
  await ctx.store.db
    .deleteFrom('session')
    .where((eb) =>
      eb.or([
        eb('expiresAt', '<', now),
        ...(sessionIDs.length === 0 ? [] : [eb('id', 'in', sessionIDs)]),
      ]),
    )
    .execute();

  return response;
}

interface PageRequest {
  readonly path: (typeof PAGE_PATHS)[number];
  readonly request: Request;
  readonly body: string;
  readonly requester: Requester;
}

function answerPageRequest(ctx: HTTPServerContext, page: PageRequest): Promise<Response> {
  const method = page.request.method === 'POST' ? 'POST' : 'GET';

  const url = new URL(page.request.url);

  return match(page.path)
    .with(PUBLIC_DOOR_PATHS.browser.login, () =>
      answerLoginRequest(ctx, { method, url, body: page.body, requester: page.requester }),
    )
    .with(PUBLIC_DOOR_PATHS.browser.enroll, () =>
      answerEnrollRequest(ctx, { method, url, body: page.body, requester: page.requester }),
    )
    .with(PUBLIC_DOOR_PATHS.browser.consent, () =>
      answerConsentRequest(ctx, {
        method,
        url,
        cookie: page.request.headers.get('cookie'),
        body: page.body,
        requester: page.requester,
      }),
    )
    .exhaustive();
}

function recordBadOrigin(options: MCPHTTPAppOptions, request: Request): void {
  options.security.record({
    kind: 'authorize_invalid',
    outcome: 'rejected',
    reason: 'bad_origin',
    path: new URL(request.url).pathname,
    requester: options.readRequester(request),
  });
}
