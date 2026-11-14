export type {
  AddClientAnswer,
  AuthAdmin,
  AuthGrantView,
  EnrollmentLink,
  RemoveClientAnswer,
} from './auth/create-auth-admin.ts';

export type { McpAuthInfo, McpServe } from './http/types.ts';

export type {
  PublicDoor,
  PublicDoorOptions,
  ServiceTokensOptions,
} from './http/create-public-door.ts';

export { createPublicDoor } from './http/create-public-door.ts';
export { isLoopbackHost } from './http/is-loopback-host.ts';
export type { ServiceTokenReload } from './service-tokens/reload-service-tokens.ts';

// The secret of a new service client, and the sha256 digest that its service-token file holds.
export { mintServiceSecret } from '@zgeoff/mcp-auth';
