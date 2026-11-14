import { readFile } from 'node:fs/promises';
import type { GrantScope } from '@boxxy/contract';
import type { ParsedServiceTokenFile } from '@zgeoff/mcp-auth';
import { parseServiceTokenText } from './parse-service-token-text.ts';

// The service clients in the file at `path`. A file that is missing or fails to parse gives the
// reason, which never quotes the file.
export async function readServiceTokenFile(
  path: string,
): Promise<ParsedServiceTokenFile<GrantScope>> {
  let text: string;

  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : 'unknown';

    return { ok: false, reason: `the file cannot be read (${code})` };
  }

  return parseServiceTokenText(text);
}
