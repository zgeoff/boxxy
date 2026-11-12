import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { atcToolResults } from '../atc-tool-results.ts';
import type { AtcToolName } from '../types.ts';
import type { FakeAtc, FakeAtcAnswer, FakeGatewayFailure } from './create-fake-atc.ts';

type Scope = 'read' | 'message' | 'spawn' | 'kill';

// the scope each tool needs, as the atc gateway checks it
const toolScopes: Readonly<Record<AtcToolName, Scope>> = {
  atc_sessions_list: 'read',
  atc_session_get: 'read',
  atc_session_spawn: 'spawn',
  atc_session_stop: 'kill',
  atc_session_adopt: 'spawn',
  atc_session_forget: 'kill',
  atc_message_send: 'message',
};

const allScopes: readonly Scope[] = ['read', 'message', 'spawn', 'kill'];

interface FakeAtcServerInput {
  readonly atc: FakeAtc;
  readonly token: string;

  // the public host name the gateway answers to
  readonly host: string;
  readonly scopes?: readonly Scope[];
}

// the `Host` and `Authorization` header of one request
export interface FakeAtcRequest {
  readonly host: string | null;
  readonly authorization: string | null;
}

export interface FakeAtcServer {
  // the `/mcp` endpoint at the server's own address
  readonly url: string;

  // each request, in order
  readonly requests: readonly FakeAtcRequest[];
  readonly stop: () => Promise<void>;
}

// The atc gateway's `/mcp` endpoint in process, on atc's own MCP server library: 403 for another
// `Host`, 401 for another bearer, 403 `insufficient_scope` for a tool outside the scopes, and the
// fake atc's answer for each tool call.
export function createFakeAtcServer(input: FakeAtcServerInput): FakeAtcServer {
  const scopes = input.scopes ?? allScopes;
  const requests: FakeAtcRequest[] = [];
  const handler = createMcpHandler(() => buildMcpServer(input.atc));

  const handleRequest = async (request: Request): Promise<Response> => {
    const host = request.headers.get('host');
    const authorization = request.headers.get('authorization');

    requests.push({ host, authorization });

    if (host !== input.host) {
      return new Response(null, { status: 403 });
    }

    if (authorization !== `Bearer ${input.token}`) {
      return new Response(null, {
        status: 401,
        headers: { 'www-authenticate': 'Bearer error="invalid_token"' },
      });
    }

    const call = await readToolCall(request);

    const tool = call?.tool ?? null;

    if (tool !== null && !scopes.includes(toolScopes[tool])) {
      return new Response(null, {
        status: 403,
        headers: {
          'www-authenticate': `Bearer error="insufficient_scope", scope="${toolScopes[tool]}"`,
        },
      });
    }

    const failure = call === null ? null : input.atc.takeGatewayFailure(call.tool, call.args);

    return failure === null || call === null
      ? handler.fetch(request)
      : toGatewayFailureResponse(failure, call.id);
  };

  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: handleRequest });

  return {
    url: `http://127.0.0.1:${server.port}/mcp`,
    requests,
    stop: async () => {
      await server.stop(true);
      await handler.close();
    },
  };
}

function buildMcpServer(atc: FakeAtc): McpServer {
  const server = new McpServer({ name: 'atc', version: '7.14.0' });

  for (const tool of Object.keys(toolScopes).filter((name) => isToolName(name))) {
    server.registerTool(
      tool,
      { description: `the fake atc's ${tool}`, inputSchema: z.looseObject({}) },
      (args) => toToolResult(atc.answer(tool, args)),
    );
  }

  return server;
}

function isToolName(name: string): name is AtcToolName {
  return Object.hasOwn(atcToolResults, name);
}

function toToolResult(answer: FakeAtcAnswer): CallToolResult {
  return match(answer)
    .returnType<CallToolResult>()
    .with({ kind: 'result' }, { kind: 'malformed' }, (answered) => ({
      content: [{ type: 'text', text: JSON.stringify(answered.result) }],
      structuredContent: { ...answered.result },
    }))
    .with({ kind: 'refusal' }, (refused) => ({
      content: [{ type: 'text', text: `${refused.code}: the fake atc refused the call` }],
      isError: true,
    }))
    .exhaustive();
}

const toolCallSchema = z.object({
  id: z.union([z.string(), z.number()]),
  method: z.literal('tools/call'),
  params: z.object({ name: z.string(), arguments: z.unknown() }),
});

async function readToolCall(request: Request): Promise<{
  readonly id: string | number;
  readonly tool: AtcToolName;
  readonly args: unknown;
} | null> {
  const body: unknown = await request
    .clone()
    .json()
    .catch(() => null);

  const call = toolCallSchema.safeParse(body);

  return call.success && isToolName(call.data.params.name)
    ? { id: call.data.id, tool: call.data.params.name, args: call.data.params.arguments }
    : null;
}

function toGatewayFailureResponse(failure: FakeGatewayFailure, id: string | number): Response {
  return match(failure)
    .returnType<Response>()
    .with({ kind: 'no-answer' }, () => new Response(null, { status: 502 }))
    .with({ kind: 'rpc-error' }, (failed) =>
      Response.json({
        jsonrpc: '2.0',
        id,
        error: { code: failed.code, message: 'the fake atc failed the call' },
      }),
    )
    .exhaustive();
}
