// Adapted from atc: packages/contract/src/gateway-paths.ts at commit 4fe647cf.

// The routes of the public door: the browser pages a person opens, and the routes a machine
// client calls. The door serves nothing else.
export const PUBLIC_DOOR_PATHS = {
  browser: {
    authorize: '/oauth2/authorize',
    login: '/login',
    enroll: '/enroll',
    consent: '/consent',
    error: '/error',
  },
  machine: {
    mcp: '/mcp',
    token: '/oauth2/token',
    revoke: '/oauth2/revoke',
    authorizationServerMetadata: '/.well-known/oauth-authorization-server',
    resourceMetadata: '/.well-known/oauth-protected-resource',
    mcpResourceMetadata: '/.well-known/oauth-protected-resource/mcp',
  },
} as const;
