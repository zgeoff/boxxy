import type { PublicDoor } from '@boxxy/auth-oauth';
import { Elysia } from 'elysia';
import { readLimitedRequest } from './read-limited-request.ts';
import { maxRequestBytes } from './serve-api.ts';

// The public door's listener. It forwards every request to the door, which serves the MCP
// endpoint and the OAuth and sign-in routes only. Bun's own body limit lets a streamed body with
// no length header through, so a body over the limit is refused here.
export function servePublicDoor(door: PublicDoor) {
  return new Elysia().all('*', { parse: 'none' }, async (route) => {
    const limited = await readLimitedRequest(route.request, maxRequestBytes);

    return limited === null
      ? Response.json({ error: 'request body too large' }, { status: 413 })
      : door.answerRequest(limited);
  });
}
