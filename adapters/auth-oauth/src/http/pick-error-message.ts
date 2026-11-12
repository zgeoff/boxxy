// Copied from atc: packages/mcp/src/http/pick-error-message.ts at commit 4fe647cf.

// The error codes better-auth sends to the error page, each with the fixed
// sentence boxxy shows for it.
const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  invalid_client: 'the client is not one added to boxxy.',
  client_disabled: 'the client is disabled.',
  invalid_redirect: 'the redirect URI is not one the client was added with.',
  unauthorized_client: 'the client may not use the authorization code grant.',
  unsupported_response_type: 'boxxy supports only the authorization code response type.',
  invalid_request: 'the request is malformed.',
};

export function pickErrorMessage(code: string | null): string {
  // the page never shows text from the request, so a link to it cannot make
  // boxxy's origin display words an attacker chose.
  const reason =
    code !== null && Object.hasOwn(ERROR_MESSAGES, code) ? ERROR_MESSAGES[code] : undefined;

  return `boxxy refused this authorization request: ${reason ?? 'the request is not valid.'}`;
}
