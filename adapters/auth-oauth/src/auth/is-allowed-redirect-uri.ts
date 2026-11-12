// Copied from atc: packages/mcp/src/auth/is-allowed-redirect-uri.ts at commit 4fe647cf.

import { isLoopbackHost } from '../http/is-loopback-host.ts';

export function isAllowedRedirectURI(raw: string): boolean {
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (url.hash !== '' || url.username !== '' || url.password !== '') {
    return false;
  }

  return url.protocol === 'https:' || (url.protocol === 'http:' && isLoopbackHost(url.hostname));
}
