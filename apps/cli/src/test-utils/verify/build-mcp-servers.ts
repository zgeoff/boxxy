import { collectReadTools } from './collect-read-tools.ts';

interface MCPClientConfig {
  readonly name: string;
  readonly secretEnv: string;
  readonly scope: string;
}

// The mcp driver's one server, `boxxy`: the public door's `/mcp` at `origin`, signed in through the
// client_credentials grant as `client`, whose secret the driver reads from `client.secretEnv`. The
// credentials go only to the authorization server at `origin`.
export function buildMCPServers(origin: string, client: MCPClientConfig) {
  return {
    servers: {
      boxxy: {
        transport: 'http' as const,
        url: `${origin}/mcp`,
        auth: {
          clientCredentials: {
            clientID: `service:${client.name}`,
            secretEnv: client.secretEnv,
            scope: client.scope,
            issuer: origin,
          },
        },
        readTools: collectReadTools(),
      },
    },
  };
}
