import { mkdir } from 'node:fs/promises';
import { createTempDir } from '@zgeoff/testing/fs';
import { createGitCommit, readGitEnv, runGit } from '@zgeoff/testing/git';

export interface GitFolderInput {
  // a folder of the test; the repository is made in it, and the folder is made when it is absent
  readonly folder: string;

  // the text of each file by its path from the folder, such as `{ 'docs/a.md': 'text' }`
  readonly files: Readonly<Record<string, string>>;

  // the target of each symbolic link by its path from the folder, such as `{ 'a': '../b' }`
  readonly links?: Readonly<Record<string, string>>;
}

// Makes the folder a git repository with one commit that holds the files and links, and no other
// setting. It returns the commit. The kit's `createGitRepo` makes a folder of its own, and a test
// that needs the repository at a path it chose uses this instead.
export async function commitGitFolder(input: GitFolderInput): Promise<string> {
  const env = readGitEnv(createTempDir('git-home').path);

  await mkdir(input.folder, { recursive: true });
  await runGit(input.folder, env, ['init', '--quiet']);

  const links = Object.entries(input.links ?? {}).map(
    ([link, target]) => [link, { symlink: target }] as const,
  );

  return createGitCommit(input.folder, env, { ...input.files, ...Object.fromEntries(links) });
}
