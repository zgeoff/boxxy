import type { CommandResult } from '../ci/run-command.ts';

export type RegistryAnswer =
  | { readonly kind: 'published' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'failed'; readonly message: string };

// npm view exits 0 with no output for a version the package lacks, and exits with code E404 for a
// package the registry lacks; any other failure leaves the version's state unknown.
export function parseRegistryAnswer(
  result: CommandResult,
  spec: string,
  version: string,
): RegistryAnswer {
  if (result.exitCode === 0) {
    return result.stdout.trim() === version ? { kind: 'published' } : { kind: 'missing' };
  }

  if (/\bE404\b/u.test(result.stderr)) {
    return { kind: 'missing' };
  }

  const detail = result.stderr.trim() === '' ? `exit ${result.exitCode}` : result.stderr.trim();

  return { kind: 'failed', message: `npm view ${spec} version failed: ${detail}` };
}
