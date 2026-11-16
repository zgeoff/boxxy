import { join } from 'node:path';
import { runGit } from '../run-git.ts';
import { createGitRepo } from './create-git-repo.ts';

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

  const files = Object.entries(input.skills).flatMap(([name, skillFiles]) =>
    Object.entries(skillFiles).map(([file, text]) => [`skills/${name}/${file}`, text] as const),
  );

  const ref = await createGitRepo({
    folder: repo,
    files: { ...Object.fromEntries(files), 'README.md': 'skills\n' },
  });

  const configured = await runGit(['config', 'uploadpack.allowAnySHA1InWant', 'true'], repo);

  if (configured.exitCode !== 0) {
    throw new Error(`git config failed: ${configured.output}`);
  }

  return { baseURL: input.folder, source, ref };
}
