import type { CommandResult } from '../ci/run-command.ts';

export type LatestVersion =
  | { readonly kind: 'found'; readonly version: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'failed'; readonly message: string };

// npm view answers E404 for a package the registry lacks, and prints nothing for a package with
// no latest dist-tag; any other failure leaves the tag unknown.
export function parseLatestVersion(result: CommandResult, name: string): LatestVersion {
  const version = result.stdout.trim();

  if (result.exitCode === 0) {
    return version === '' ? { kind: 'none' } : { kind: 'found', version };
  }

  if (/\bE404\b/u.test(result.stderr)) {
    return { kind: 'none' };
  }

  const detail = result.stderr.trim() === '' ? `exit ${result.exitCode}` : result.stderr.trim();

  return { kind: 'failed', message: `npm view ${name} dist-tags.latest failed: ${detail}` };
}
