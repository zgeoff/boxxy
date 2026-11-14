import type { GrantScope } from '@boxxy/contract';
import { grantScopes } from '@boxxy/contract';
import { parseServiceTokenFile } from '@zgeoff/mcp-auth';
import type { ParsedServiceTokenFile } from '@zgeoff/mcp-auth';
import { z } from 'zod';
import { serviceTokenPrefix } from './constants.ts';

// The package's parser, with two departures that the public door's design explains: a file of no
// clients parses, so removing the last client revokes it, and a client with a static token is
// refused, since anyone who read the file could send that token. No reason quotes the file.
export function parseServiceTokenText(text: string): ParsedServiceTokenFile<GrantScope> {
  const parsed = parseServiceTokenFile(text, { prefix: serviceTokenPrefix, scopes: grantScopes });

  if (!parsed.ok) {
    return findEmptyFile(text) ?? parsed;
  }

  const holder = parsed.file.clients.find((client) => client.tokens.length > 0);

  return holder === undefined
    ? parsed
    : {
        ok: false,
        reason: `the client ${holder.name} holds a static token, and boxxy takes only secretDigests`,
      };
}

const emptyFileSchema = z.strictObject({
  resource: z.string().min(1),
  clients: z.strictObject({}),
});

function findEmptyFile(text: string): ParsedServiceTokenFile<GrantScope> | null {
  let raw: unknown;

  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }

  const empty = emptyFileSchema.safeParse(raw);

  return empty.success ? { ok: true, file: { resource: empty.data.resource, clients: [] } } : null;
}
