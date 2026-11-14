import { mintServiceSecret } from '@boxxy/auth-oauth';
import { localMCPClient } from './constants.ts';

// Mints the run's service client and returns its secret's digest. The supervisor runs `launch` and
// its mcp driver, so the secret goes to its environment, which it copied for the harness before
// `launch` runs; the secret never reaches the harness.
export function createLocalMCPClient(): string {
  const minted = mintServiceSecret();

  process.env[localMCPClient.secretEnv] = minted.secret;

  return minted.digest;
}
