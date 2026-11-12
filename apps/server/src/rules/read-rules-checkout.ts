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
// gives every file that is not hidden, with no ref check.
export function readRulesCheckout(source: RulesSource): Promise<CheckoutAnswer> {
  return existsSync(path.join(source.folder, '.git'))
    ? readGitCheckout(source)
    : readFolder(source.folder);
}

async function readGitCheckout(source: RulesSource): Promise<CheckoutAnswer> {
  const folder = source.folder;

  // Every git call ignores `git replace`, which could swap a reviewed object for unreviewed bytes
  // while HEAD and the tree stay clean.
  const status = await $`git --no-replace-objects -C ${folder} status --porcelain`
    .quiet()
    .nothrow();

  if (status.exitCode !== 0) {
    return { kind: 'rejected', reason: `git could not read ${folder}` };
  }

  if (status.text().trim() !== '') {
    return { kind: 'rejected', reason: 'the rules checkout has uncommitted changes' };
  }

  const ref =
    await $`git --no-replace-objects -C ${folder} rev-parse --verify --quiet ${`${source.ref}^{commit}`}`
      .quiet()
      .nothrow();

  if (ref.exitCode !== 0) {
    return { kind: 'rejected', reason: `git could not read the rules ref ${source.ref}` };
  }

  // HEAD can move while the server reads, so every later step names this one commit ID, and the
  // files come from git, never from the working tree.
  const head =
    await $`git --no-replace-objects -C ${folder} rev-parse --verify --quiet HEAD^{commit}`
      .quiet()
      .nothrow();

  if (head.exitCode !== 0) {
    return { kind: 'rejected', reason: `git could not read the HEAD of ${folder}` };
  }

  const commit = head.text().trim();

  const merged =
    await $`git --no-replace-objects -C ${folder} merge-base --is-ancestor ${commit} ${source.ref}`
      .quiet()
      .nothrow();

  if (merged.exitCode !== 0) {
    return {
      kind: 'rejected',
      reason: `the rules checkout is at a commit that ${source.ref} does not hold`,
    };
  }

  const listed = await $`git --no-replace-objects -C ${folder} ls-tree -r -z --full-tree ${commit}`
    .quiet()
    .text();

  const entries = listed
    .split('\0')
    .filter((line) => line !== '')
    .map((line) => parseTreeEntry(line));

  const linked = entries.find((entry) => !isPlainFile(entry));

  if (linked !== undefined) {
    return {
      kind: 'rejected',
      reason: `the rules commit holds ${linked.path}, which is not a plain file`,
    };
  }

  const files = await readCommitFiles(folder, entries);

  return { kind: 'read', checkout: { commit, files } };
}

interface TreeEntry {
  readonly mode: string;
  readonly type: string;
  readonly object: string;
  readonly path: string;
}

// one line of `git ls-tree -z`: `<mode> <type> <object>\t<path>`
function parseTreeEntry(line: string): TreeEntry {
  const tab = line.indexOf('\t');
  const [mode = '', type = '', object = ''] = line.slice(0, tab).split(' ');

  return { mode, type, object, path: line.slice(tab + 1) };
}

// a symlink (120000) could point outside the checkout, and a submodule has no bytes here
function isPlainFile(entry: TreeEntry): boolean {
  return entry.type === 'blob' && (entry.mode === '100644' || entry.mode === '100755');
}

async function readCommitFiles(
  folder: string,
  entries: readonly TreeEntry[],
): Promise<ReadonlyMap<string, Uint8Array>> {
  const read = await Promise.all(
    entries
      .toSorted((left, right) => (left.path < right.path ? -1 : 1))
      .map(async (entry): Promise<[string, Uint8Array]> => {
        const blob =
          await $`git --no-replace-objects -C ${folder} cat-file blob ${entry.object}`.quiet();

        return [entry.path, new Uint8Array(blob.stdout)];
      }),
  );

  return new Map(read);
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
