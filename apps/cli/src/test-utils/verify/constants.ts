// The service client that `local` mints for each run, with the read and write scopes, and the
// variable of the supervisor's environment that holds its secret.
export const localMCPClient = {
  name: 'verify-local',
  secretEnv: 'BOXXY_VERIFY_MCP_SECRET',
  scope: 'read write',
};

// The read client of the deployed door. It holds only the read scope, so the door refuses any write
// that the read-only fence misses.
export const prodMCPClient = {
  name: 'wringer-ro',
  secretEnv: 'BOXXY_PROD_MCP_SECRET',
  scope: 'read',
};

// The door's protected-resource metadata, which an MCP client reads before it signs in.
export const mcpDoorMetadataPath = '/.well-known/oauth-protected-resource/mcp';

// The variable that holds the deployed public door's origin, its OAuth issuer. The repo is public
// and names no host, so the origin comes from 1Password with the read client's secret.
export const prodOriginEnv = 'BOXXY_PROD_ORIGIN';
