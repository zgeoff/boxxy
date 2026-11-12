import { match } from 'ts-pattern';
import { cliPackage } from './constants.ts';
import type { ManifestParse } from './parse-package-manifest.ts';
import type { PublishMode, PublishPaths } from './parse-publish-request.ts';

export type CLIAssetsStep =
  | { readonly kind: 'skip'; readonly message: string }
  | { readonly kind: 'refused'; readonly message: string }

  // `uploadTag` is null in a rehearsal, which builds and checks the assets and uploads nothing
  | { readonly kind: 'build'; readonly version: string; readonly uploadTag: string | null };

export interface CLIAssetsRequest {
  readonly mode: PublishMode;

  readonly paths: PublishPaths;

  readonly manifest: ManifestParse;
}

// The run is dispatched at the tag of the first released path, which need not be the CLI's, so the
// upload tag comes from the CLI's own name and version at that commit.
export function pickCLIAssetsStep(request: CLIAssetsRequest): CLIAssetsStep {
  if (request.paths.kind === 'listed' && !request.paths.paths.includes(cliPackage.path)) {
    return {
      kind: 'skip',
      message: `skipping the CLI assets: the run does not release ${cliPackage.path}\n`,
    };
  }

  return match(request.manifest)
    .with({ kind: 'invalid' }, (invalid): CLIAssetsStep => ({
      kind: 'refused',
      message: invalid.message,
    }))
    .with({ kind: 'private' }, (entry): CLIAssetsStep => ({
      kind: 'refused',
      message: `${entry.name} is private, so no release carries its assets`,
    }))
    .with({ kind: 'public' }, (entry): CLIAssetsStep => {
      if (entry.releasedVersion !== undefined && entry.releasedVersion !== entry.version) {
        return {
          kind: 'refused',
          message: `the release tagged ${cliPackage.path} at ${entry.releasedVersion}, but its package.json holds ${entry.version}`,
        };
      }

      return {
        kind: 'build',
        version: entry.version,
        uploadTag: request.mode === 'publish' ? `${entry.name}@${entry.version}` : null,
      };
    })
    .exhaustive();
}
