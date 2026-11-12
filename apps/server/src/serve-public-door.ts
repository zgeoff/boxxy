import type { PublicDoor } from '@boxxy/auth-oauth';
import { Elysia } from 'elysia';

// The public door's listener. It forwards every request to the door, which serves the MCP
// endpoint and the OAuth and sign-in routes only; the RPC route and the health check are not
// among them.
export function servePublicDoor(door: PublicDoor) {
  return new Elysia().all('*', { parse: 'none' }, (route) => door.answerRequest(route.request));
}
