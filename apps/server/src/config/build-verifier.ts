import type { Forge, Verifier } from '@boxxy/model';
import { createWringerVerifier } from '@boxxy/verifier-wringer';
import { verifyGateCheck } from '../constants.ts';

// Reads the verify gate through the forge, so a server with no forge has no verifier.
export function buildVerifier(forge: Forge | null): Verifier | null {
  return forge === null ? null : createWringerVerifier({ forge, gateCheck: verifyGateCheck });
}
