import { shippedWaitName } from '@boxxy/model';
import type { ParsedRulesFile } from '../parse/rules-file-schema.ts';

// Each step that waits on `shipped` skips an item of a repo with no `repos` entry, because the
// repo ships `none`; the warning names each such repo of the server's `spawn.repos`.
export function collectShipWarnings(
  file: ParsedRulesFile,
  spawnRepos: readonly string[],
): string[] {
  const unlisted = spawnRepos.filter((repo) => !Object.hasOwn(file.repos, repo));

  return Object.values(file.pipelines).flatMap((steps) =>
    steps
      .filter((step) => step.waits?.includes(shippedWaitName) === true)
      .flatMap((step) =>
        unlisted.map(
          (repo) =>
            `the repo ${repo} has no repos entry, so its items skip the ${step.phase} step, which waits on ${shippedWaitName}`,
        ),
      ),
  );
}
