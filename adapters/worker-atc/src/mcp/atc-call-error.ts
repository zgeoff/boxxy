// A call that atc refused or answered unreadably, with atc's code or one the client sets. `problem`
// is the cause atc gives under some codes, such as impd's error code under `host_unavailable`. The
// message never holds the token.
export class AtcCallError extends Error {
  readonly code: string;

  readonly problem: string | null;

  constructor(code: string, message: string, problem: string | null = null) {
    super(message);

    this.name = 'AtcCallError';
    this.code = code;
    this.problem = problem;
  }
}
