import { existsSync } from 'node:fs';
import path from 'node:path';
import { $ } from 'bun';
import type { RulesCheckout } from './load-server-rules.ts';

export type CheckoutAnswer =
  | { readonly kind: 'read'; readonly checkout: RulesCheckout }
  | { readonly kind: 'rejected'; readonly reason: string };

// A git checkout gives its committed files at HEAD, and a checkout with uncommitted changes is
// refused. A folder with no `.git` gives every file that is not hidden.
export function readRulesCheckout(folder: string): Promise<CheckoutAnswer> {
  return existsSync(path.join(folder, '.git')) ? readGitCheckout(folder) : readFolder(folder);
}

async function readGitCheckout(folder: string): Promise<CheckoutAnswer> {
  const status = await $`git -C ${folder} status --porcelain`.quiet().nothrow();

  if (status.exitCode !== 0) {
    return { kind: 'rejected', reason: `git could not read ${folder}` };
  }

  if (status.text().trim() !== '') {
    return { kind: 'rejected', reason: 'the rules checkout has uncommitted changes' };
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
