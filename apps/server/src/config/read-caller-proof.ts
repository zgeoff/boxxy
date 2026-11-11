import { impIdentityCallerProof } from '@boxxy/caller-proof-imp';
import type { CallerProof, Clock } from '@boxxy/model';
import { noCallerProof } from '../no-caller-proof.ts';
import { readTrustedIssuers } from './read-trusted-issuers.ts';
import type { ServerConfig } from './server-config-schema.ts';

export type ProofAnswer =
  | { readonly kind: 'read'; readonly callerProof: CallerProof }
  | { readonly kind: 'refused'; readonly message: string };

// The proof of who sent a session or hook call, from the trust documents in the configured
// folders. With no `trustedIssuers` section, the proof proves nobody, so every such call is
// refused. The adapter throws on a malformed trust document, so such a server never starts.
export async function readCallerProof(
  trustedIssuers: ServerConfig['trustedIssuers'],
  clock: Clock,
): Promise<ProofAnswer> {
  if (trustedIssuers === undefined) {
    return { kind: 'read', callerProof: noCallerProof };
  }

  const read = await readTrustedIssuers(trustedIssuers.folders);

  if (read.kind === 'invalid') {
    return { kind: 'refused', message: read.message };
  }

  return {
    kind: 'read',
    callerProof: impIdentityCallerProof({
      issuers: read.issuers,
      audience: trustedIssuers.audience,
      clock,
    }),
  };
}
