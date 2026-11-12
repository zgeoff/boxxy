import type { check } from '@noslop/cli/check';
import type { sendResult } from '@noslop/cli/post';

// The two noslop calls the gate makes. The server passes the real ones; a test passes its own.
export interface NoslopClient {
  readonly sendResult: typeof sendResult;
  readonly check: typeof check;
}

export interface NoslopReviewGateOptions {
  // the noslop App's keys: `NOSLOP_GITHUB_APP_ID`, `NOSLOP_GITHUB_APP_PRIVATE_KEY` and
  // `NOSLOP_GITHUB_APP_INSTALLATION_ID`
  readonly appEnv: Readonly<Record<string, string | undefined>>;
  readonly client?: NoslopClient;
}
