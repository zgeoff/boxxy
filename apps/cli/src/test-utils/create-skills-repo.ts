import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { runGit } from '../run-git.ts';

export interface SkillsRepoInput {
  // an empty folder of the test; the repository is made inside it
  readonly folder: string;

  // the files of each skill by skill name, such as `{ 'bake-off': { 'SKILL.md': 'text' } }`
  readonly skills: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export interface SkillsRepo {
  // the value for `BOXXY_SKILLS_URL`
  readonly baseURL: string;

  // `source` is the pin's repository, `ref` its one full commit
  readonly source: string;
  readonly ref: string;
}

const source = 'example/skills';

// A git repository with one commit that holds `skills/<name>/...`, served from a folder in place
// of GitHub. It lets the commit be fetched by ID, as GitHub does.
export async function createSkillsRepo(input: SkillsRepoInput): Promise<SkillsRepo> {
  const repo = join(input.folder, `${source}.git`);

  await mkdir(repo, { recursive: true });

  for (const [name, files] of Object.entries(input.skills)) {
    for (const [file, text] of Object.entries(files)) {
      const path = join(repo, 'skills', name, file);

      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, text);
    }
  }

  await writeFile(join(repo, 'README.md'), 'skills\n');

  const steps = [
    ['init', '--quiet'],
    ['config', 'uploadpack.allowAnySHA1InWant', 'true'],
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
      'skills',
    ],
  ];

  for (const step of steps) {
    const done = await runGit(step, repo);

    if (done.exitCode !== 0) {
      throw new Error(`git ${step.join(' ')} failed: ${done.output}`);
    }
  }

  const head = await runGit(['rev-parse', 'HEAD'], repo);

  return { baseURL: input.folder, source, ref: head.output.trim() };
}
