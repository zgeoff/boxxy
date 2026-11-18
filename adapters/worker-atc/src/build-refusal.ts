import { refusalMessageMaxChars } from '@boxxy/model';
import type { RefusalDetail } from '@boxxy/model';
import type { AtcCallError } from './mcp/atc-call-error.ts';

// atc writes its text as `<code>: <message>`, so the code is not repeated. A long message is cut,
// and boxxy keeps the first part.
export function buildRefusal(error: AtcCallError): RefusalDetail {
  const prefix = `${error.code}: `;

  const message = error.message.startsWith(prefix)
    ? error.message.slice(prefix.length)
    : error.message;

  return {
    code: error.code,
    problem: error.problem,
    message: message.slice(0, refusalMessageMaxChars),
  };
}
