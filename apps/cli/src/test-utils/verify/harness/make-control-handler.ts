import { brandSchemas } from '@boxxy/model';
import { buildRPCRequest } from '@boxxy/server/test-utils/build-rpc-request';
import { makeBrokerSend } from '@boxxy/server/test-utils/make-broker-send';
import invariant from 'tiny-invariant';
import type { z } from 'zod';
import { ControlConflictError } from './control-conflict-error.ts';
import { controlRoutes } from './control-routes.ts';
import { drainOutbox } from './drain-outbox.ts';
import { endTurn } from './end-turn.ts';
import { mergePullRequest } from './merge-pull-request.ts';
import { openPullRequest } from './open-pull-request.ts';
import { sendTelemetry } from './send-telemetry.ts';
import { setCurrentItem } from './set-current-item.ts';
import { startSession } from './start-session.ts';
import type { VerifyHarness } from './types.ts';

type Handler = (request: Request) => Promise<Response>;

type Method = 'GET' | 'POST';

interface BoundRoute {
  readonly method: Method;
  readonly path: string;
  readonly handler: Handler;
}

const minuteMs = 60_000;

// The control routes as the `routes` of `Bun.serve`. Steps run one at a time, in arrival order, so
// a slow step cannot overlap the next.
export function makeControlHandler(
  harness: VerifyHarness,
): Record<string, Partial<Record<Method, Handler>>> {
  const sendToBroker = makeBrokerSend(harness.server);
  let tail: Promise<null> = Promise.resolve(null);

  const inOrder =
    (handler: Handler): Handler =>
    async (request) => {
      const previous = tail;
      const turn = Promise.withResolvers<null>();

      tail = turn.promise;

      await previous;

      try {
        return await handler(request);
      } finally {
        turn.resolve(null);
      }
    };

  const bound: BoundRoute[] = [
    bindRoute(controlRoutes.health, async () => {
      const status = await sendToBroker(buildRPCRequest({ procedure: 'runner.status', input: {} }));

      invariant(status.status === 200, `the broker route answered ${status.status}`);

      // an item that no fact names: pepys answers, and holds nothing for it
      const unknownItem = brandSchemas.itemId.parse('01900000-0000-7000-8000-000000000000');

      const answer = await harness.pepys.reader.readStageTime(unknownItem);

      invariant(answer.kind === 'value', 'pepys under test answers a query');

      return { clock: new Date(harness.server.dispatch.clock.now()).toISOString() };
    }),
    bindRoute(controlRoutes.setCurrent, async (body) => {
      await setCurrentItem(harness, body.item);

      return null;
    }),
    bindRoute(controlRoutes.readCurrent, () => {
      if (harness.current === null) {
        throw new ControlConflictError('no current item: run file-item or land-item first');
      }

      return Promise.resolve({ item: harness.current });
    }),
    bindRoute(controlRoutes.startSession, (body) => startSession(harness, body)),
    bindRoute(controlRoutes.advanceClock, (body) => {
      const now = harness.server.dispatch.clock.advance(body.minutes * minuteMs);

      return Promise.resolve({ clock: new Date(now).toISOString() });
    }),
    bindRoute(controlRoutes.endTurn, (body) => endTurn(harness, body.attempt)),
    bindRoute(controlRoutes.openPullRequest, () => Promise.resolve(openPullRequest(harness))),
    bindRoute(controlRoutes.mergePullRequest, (body) => mergePullRequest(harness, body)),
    bindRoute(controlRoutes.sendTelemetry, async (body) => {
      await sendTelemetry(harness, body.requests);

      return null;
    }),
    bindRoute(controlRoutes.drainOutbox, () => drainOutbox(harness)),
  ];

  const routes: Record<string, Partial<Record<Method, Handler>>> = {};

  for (const route of bound) {
    routes[route.path] = { ...routes[route.path], [route.method]: inOrder(route.handler) };
  }

  return routes;
}

interface RouteSchema<Request extends z.ZodType> {
  readonly method: Method;
  readonly path: string;
  readonly request: Request;
}

// Parses the body with the route's schema, runs the step, and answers with the step's value, 400
// for a body that is not JSON or that the schema refuses, and 409 for a step whose state is wrong.
function bindRoute<Request extends z.ZodType>(
  route: RouteSchema<Request>,
  run: (body: z.output<Request>) => Promise<unknown>,
): BoundRoute {
  const handler: Handler = async (request) => {
    const text = await request.text();

    const body = parseBodyText(text);

    if (body.kind === 'invalid') {
      return Response.json({ error: 'the body is not JSON' }, { status: 400 });
    }

    const parsed = route.request.safeParse(body.value);

    if (!parsed.success) {
      return Response.json({ error: parsed.error.message }, { status: 400 });
    }

    try {
      const answer = await run(parsed.data);

      return Response.json(answer);
    } catch (error) {
      if (error instanceof ControlConflictError) {
        return Response.json({ error: error.message }, { status: 409 });
      }

      return Response.json({ error: String(error) }, { status: 500 });
    }
  };

  return { method: route.method, path: route.path, handler };
}

type BodyText = { readonly kind: 'json'; readonly value: unknown } | { readonly kind: 'invalid' };

function parseBodyText(text: string): BodyText {
  if (text === '') {
    return { kind: 'json', value: null };
  }

  try {
    const value: unknown = JSON.parse(text);

    return { kind: 'json', value };
  } catch {
    return { kind: 'invalid' };
  }
}
