// A mistake in the command line or the environment. The CLI prints the message and exits with 2.
export class UsageError extends Error {
  override readonly name = 'UsageError';
}
