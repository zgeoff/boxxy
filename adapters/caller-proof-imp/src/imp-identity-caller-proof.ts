import type { CallerProof, Clock } from '@boxxy/model';
import { loadIdentityIssuers, verifyImpIdentity } from '@impz/client/identity';
import type { ImpIdentityCallerProofOptions } from './types.ts';

const identityHeader = 'imp-identity';

// The proof from the broker's identity token. The trust documents are checked once, here, so a
// bad document stops the server at start. With no document, the proof proves no request.
export function impIdentityCallerProof(options: ImpIdentityCallerProofOptions): CallerProof {
  if (options.issuers.length === 0 || options.audience === '') {
    return { prove: () => Promise.resolve(null) };
  }

  const issuers = loadIdentityIssuers(options.issuers);

  return {
    prove: async (request) => {
      const verified = await verifyImpIdentity(request.headers.get(identityHeader), {
        issuers,
        audience: options.audience,
        nowSeconds: toNowSeconds(options.clock),
      });

      return verified === null ? null : { issuer: verified.issuer, subject: verified.id };
    },
  };
}

function toNowSeconds(clock: Clock): number {
  return Math.floor(clock.now() / 1000);
}
