import type { CallerProof } from '@boxxy/model';

// The server's proof when its configuration names no trusted issuer: it proves no request, so
// every session and hook call is refused.
export const noCallerProof: CallerProof = {
  prove: () => Promise.resolve(null),
};
