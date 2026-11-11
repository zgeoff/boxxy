import type { Clock } from '@boxxy/model';

export interface ImpIdentityCallerProofOptions {
  // the trust documents as parsed JSON, one per issuer; the app reads the files
  readonly issuers: readonly unknown[];

  // the made-up host that the sessions call, which the broker names as the token's audience
  readonly audience: string;
  readonly clock: Clock;
}
