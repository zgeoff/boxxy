// What the MCP transport reads of a verified token: the scopes it holds, and the resource metadata
// that a scope challenge points at.
export interface McpAuthInfo {
  readonly token: string;
  readonly clientId: string;
  readonly scopes: string[];
  readonly resourceMetadataUrl: string;
}

// Serves one MCP request for a token that verified.
export type McpServe = (request: Request, authInfo: McpAuthInfo) => Promise<Response>;
