import {
  Client,
  InsufficientScopeError,
  ProtocolError,
  SdkHttpError,
  StreamableHTTPClientTransport,
  UnauthorizedError,
} from '@modelcontextprotocol/client';
import type { z } from 'zod';
import type { AtcClient, AtcToolName } from '../types.ts';
import { AtcCallError } from './atc-call-error.ts';
import { atcToolResults as results } from './atc-tool-results.ts';
import { parseToolResult } from './parse-tool-result.ts';
import { toCappedResponse } from './to-capped-response.ts';

interface AtcMcpClientInput {
  // the gateway's `/mcp` endpoint, such as its in-cluster Service address
  readonly url: string;

  // the gateway's public host name, sent as `Host`; null sends the URL's own host
  readonly host: string | null;

  // the service token, sent as the bearer; never logged and never in an error
  readonly token: string;
  readonly fetch: (url: string | URL, init: RequestInit) => Promise<Response>;
  readonly timeoutMs: number;
}

// The atc tools over MCP streamable HTTP. The client connects on its first call, and connects
// again on the next call after a connect fails.
export function createAtcMcpClient(input: AtcMcpClientInput): AtcClient {
  let connecting: Promise<Client> | null = null;

  const connect = async (): Promise<Client> => {
    connecting ??= openClient(input);

    try {
      return await connecting;
    } catch (error) {
      connecting = null;
      throw toCallError(error);
    }
  };

  const call = async <Schema extends z.ZodType>(
    tool: AtcToolName,
    args: Readonly<Record<string, unknown>>,
    schema: Schema,
  ): Promise<z.output<Schema>> => {
    const client = await connect();

    let result: unknown;

    try {
      result = await client.callTool(
        { name: tool, arguments: { ...args } },
        { timeout: input.timeoutMs },
      );
    } catch (error) {
      throw toCallError(error);
    }

    const parsed = parseToolResult(tool, result, schema);

    if (parsed.kind === 'refused') {
      throw parsed.error;
    }

    return parsed.value;
  };

  return {
    listSessions: () => call('atc_sessions_list', {}, results.atc_sessions_list),
    readSession: (session) => call('atc_session_get', { session }, results.atc_session_get),
    spawnSession: (spawn) => call('atc_session_spawn', { ...spawn }, results.atc_session_spawn),
    stopSession: (session) => call('atc_session_stop', { session }, results.atc_session_stop),
    adoptSession: (session) => call('atc_session_adopt', { session }, results.atc_session_adopt),
    forgetSession: (forget) =>
      call('atc_session_forget', { ...forget }, results.atc_session_forget),
    sendMessage: (message) => call('atc_message_send', { ...message }, results.atc_message_send),
  };
}

const maxBodyBytes = 1024 * 1024;

async function openClient(input: AtcMcpClientInput): Promise<Client> {
  const sendRequest = async (url: string | URL, init: RequestInit | undefined) => {
    const response = await input.fetch(url, { ...init, headers: buildHeaders(input, init) });

    // the client library reads a whole body before any schema sees it
    return toCappedResponse(response, maxBodyBytes);
  };

  const transport = new StreamableHTTPClientTransport(new URL(input.url), {
    fetch: sendRequest,

    // a redirect would carry the bearer to an address the configuration never named
    requestInit: { redirect: 'error' },

    // a step-up sign-in needs a person, and a service token has none
    onInsufficientScope: 'throw',
  });

  const client = new Client({ name: 'boxxy', version: '1.0.0' });

  await client.connect(transport, { timeout: input.timeoutMs });

  return client;
}

function buildHeaders(input: AtcMcpClientInput, init: RequestInit | undefined): Headers {
  const headers = new Headers(init?.headers);

  headers.set('authorization', `Bearer ${input.token}`);

  if (input.host !== null) {
    headers.set('host', input.host);
  }

  return headers;
}

// An answer atc gave becomes an `AtcCallError`. Any other error means atc gave no answer, and keeps
// only its status or its own message: a response body may echo what the request sent.
function toCallError(error: unknown): Error {
  if (error instanceof InsufficientScopeError) {
    return new AtcCallError(
      'insufficient_scope',
      `the atc token lacks the scope ${toScopeName(error.requiredScope)}`,
    );
  }

  if (error instanceof UnauthorizedError) {
    return new AtcCallError('unauthorized', 'atc refused the token');
  }

  if (error instanceof SdkHttpError) {
    return toHttpError(error.status);
  }

  if (error instanceof ProtocolError) {
    return toProtocolError(error.code);
  }

  return error instanceof Error ? error : new Error(String(error));
}

// the gateway's challenge names the scope; a value that is no scope name is never echoed
function toScopeName(scope: string | undefined): string {
  return scope !== undefined && /^[a-z][a-z_ ]{0,63}$/u.test(scope) ? `"${scope}"` : '(not named)';
}

function toHttpError(status: number): Error {
  if (status === 401) {
    return new AtcCallError('unauthorized', 'atc refused the token');
  }

  if (status === 403) {
    return new AtcCallError('forbidden', 'atc refused the request: check the Host and the token');
  }

  return new Error(`atc gave no answer: HTTP ${status}`);
}

// JSON-RPC codes for a request the server refused before it ran: parse error, invalid request,
// method not found and invalid params
const refusedBeforeRunCodes: ReadonlySet<number> = new Set([-32_700, -32_600, -32_601, -32_602]);

// atc may have run a call that any other JSON-RPC error answers, such as an internal error
function toProtocolError(code: number): Error {
  return refusedBeforeRunCodes.has(code)
    ? new AtcCallError('protocol_error', `atc refused the request with JSON-RPC ${code}`)
    : new Error(`atc gave no answer: JSON-RPC ${code}`);
}
