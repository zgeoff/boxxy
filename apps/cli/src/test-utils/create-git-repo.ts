import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { runGit } from '../run-git.ts';

export interface GitRepoInput {
  // a folder of the test; the repository is made in it, and the folder is made when it is absent
  readonly folder: string;

  // the text of each file by its path from the folder, such as `{ 'docs/a.md': 'text' }`
  readonly files: Readonly<Record<string, string>>;
}

// A git repository with one commit that holds the files, and no other setting. It returns the
// commit.
export async function createGitRepo(input: GitRepoInput): Promise<string> {
  for (const [file, text] of Object.entries(input.files)) {
    const path = join(input.folder, file);

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
  }

  const steps = [
    ['init', '--quiet'],
    ['add', '--all'],
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      'files',
    ],
    ['rev-parse', 'HEAD'],
  ];

  let output = '';

  for (const step of steps) {
    const done = await runGit(step, input.folder);

    if (done.exitCode !== 0) {
      throw new Error(`git ${step.join(' ')} failed: ${done.output}`);
    }

    output = done.output;
  }

  return output.trim();
}
