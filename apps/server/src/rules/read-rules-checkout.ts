import { existsSync } from 'node:fs';
import path from 'node:path';
import { $ } from 'bun';
import type { RulesCheckout } from './load-server-rules.ts';

export type CheckoutAnswer =
  | { readonly kind: 'read'; readonly checkout: RulesCheckout }
  | { readonly kind: 'rejected'; readonly reason: string };

// Where the rules come from: a checkout, and the ref whose history holds every commit it may load
export interface RulesSource {
  readonly folder: string;
  readonly ref: string;
}

// A git checkout gives its committed files at HEAD, when the ref's history holds HEAD, so only a
// merged commit loads. A checkout with uncommitted changes is refused. A folder with no `.git`
// gives every file that is not hidden.
export function readRulesCheckout(source: RulesSource): Promise<CheckoutAnswer> {
  return existsSync(path.join(source.folder, '.git'))
    ? readGitCheckout(source)
    : readFolder(source.folder);
}

async function readGitCheckout(source: RulesSource): Promise<CheckoutAnswer> {
  const folder = source.folder;

  const status = await $`git -C ${folder} status --porcelain`.quiet().nothrow();

  if (status.exitCode !== 0) {
    return { kind: 'rejected', reason: `git could not read ${folder}` };
  }

  if (status.text().trim() !== '') {
    return { kind: 'rejected', reason: 'the rules checkout has uncommitted changes' };
  }

  const ref = await $`git -C ${folder} rev-parse --verify --quiet ${`${source.ref}^{commit}`}`
    .quiet()
    .nothrow();

  if (ref.exitCode !== 0) {
    return { kind: 'rejected', reason: `git could not read the rules ref ${source.ref}` };
  }

  const merged = await $`git -C ${folder} merge-base --is-ancestor HEAD ${source.ref}`
    .quiet()
    .nothrow();

  if (merged.exitCode !== 0) {
    return {
      kind: 'rejected',
      reason: `the rules checkout is at a commit that ${source.ref} does not hold`,
    };
  }

  const commit = await $`git -C ${folder} rev-parse HEAD`.quiet().text();
  const listed = await $`git -C ${folder} ls-files -z`.quiet().text();

  const paths = listed.split('\0').filter((entry) => entry !== '');

  const files = await readFiles(folder, paths);

  return { kind: 'read', checkout: { commit: commit.trim(), files } };
}

async function readFiles(
  folder: string,
  paths: readonly string[],
): Promise<ReadonlyMap<string, Uint8Array>> {
  const entries = await Promise.all(
    paths.toSorted().map(async (file): Promise<[string, Uint8Array]> => {
      const bytes = await Bun.file(path.join(folder, file)).bytes();

      return [file, bytes];
    }),
  );

  return new Map(entries);
}

// The commit of a checkout that is a plain folder. Its rules version is still the content hash
// of its files.
const folderCommit = 'folder';

async function readFolder(folder: string): Promise<CheckoutAnswer> {
  if (!existsSync(folder)) {
    return { kind: 'rejected', reason: `no rules folder at ${folder}` };
  }

  const paths = await Array.fromAsync(new Bun.Glob('**/*').scan({ cwd: folder, dot: false }));
  const files = await readFiles(folder, paths);

  return { kind: 'read', checkout: { commit: folderCommit, files } };
}
