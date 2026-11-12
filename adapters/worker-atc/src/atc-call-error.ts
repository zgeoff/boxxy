// A call that atc answered and refused, or answered with a result the adapter cannot read: atc's
// own code, or `unauthorized`, `forbidden`, `insufficient_scope`, `protocol_error` or
// `malformed_answer`. The message never holds the token.
export class AtcCallError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);

    this.name = 'AtcCallError';
    this.code = code;
  }
}
