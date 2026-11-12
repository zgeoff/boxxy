import { cp, lstat, mkdir, mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { skillsRepoFolder, workspaceSkillsFolder } from '../constants.ts';
import type { CLIDeps } from '../types.ts';

interface SkillsPin {
  // the repository, as owner/name
  readonly source: string;

  // one full commit
  readonly ref: string;
}

export interface InstallSkillsInput {
  // the rules' pin; null when the rules have none
  readonly pin: SkillsPin | null;
  readonly names: readonly string[];

  // the folder the agent works in; the skills land in its `.claude/skills`
  readonly workspace: string;

  // where `<owner>/<name>.git` is fetched from
  readonly baseURL: string;
  readonly runGit: CLIDeps['runGit'];
}

const sourcePattern = /^[\w.-]+\/[\w.-]+$/u;
const refPattern = /^[0-9a-f]{40,64}$/u;

// Copies each named skill at the pin into the workspace and returns the names that are not there
// afterwards. A skill is there when its folder holds a `SKILL.md`. A fetch that fails leaves every
// name missing, because the attempt cannot tell a skill it lacks from one it could not read.
export async function installSkills(input: InstallSkillsInput): Promise<string[]> {
  if (input.names.length === 0) {
    return [];
  }

  const pin = input.pin;

  if (pin === null || !sourcePattern.test(pin.source) || !refPattern.test(pin.ref)) {
    return [...input.names];
  }

  const scratch = await mkdtemp(join(tmpdir(), 'boxxy-skills-'));

  try {
    const fetched = await runFetch(input, scratch, pin);

    if (!fetched) {
      return [...input.names];
    }

    const missing: string[] = [];

    for (const name of input.names) {
      if (!(await installSkill(input, scratch, name))) {
        missing.push(name);
      }
    }

    return missing;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function runFetch(
  input: InstallSkillsInput,
  scratch: string,
  pin: SkillsPin,
): Promise<boolean> {
  const init = await input.runGit(['init', '--quiet', scratch]);

  if (init.exitCode !== 0) {
    return false;
  }

  const fetched = await input.runGit(
    ['fetch', '--quiet', '--depth', '1', `${input.baseURL}/${pin.source}.git`, pin.ref],
    scratch,
  );

  return fetched.exitCode === 0;
}

const namePattern = /^[a-z0-9][a-z0-9._-]*$/u;

async function installSkill(
  input: InstallSkillsInput,
  scratch: string,
  name: string,
): Promise<boolean> {
  if (!namePattern.test(name)) {
    return false;
  }

  const checkout = await input.runGit(
    ['checkout', '--quiet', 'FETCH_HEAD', '--', `${skillsRepoFolder}/${name}`],
    scratch,
  );

  if (checkout.exitCode !== 0) {
    return false;
  }

  const inside = await probeSkillsFolderInWorkspace(input.workspace);

  if (!inside) {
    return false;
  }

  const target = join(input.workspace, workspaceSkillsFolder, name);

  // Node has no openat, so a link made between the check above and this rm or cp still moves them
  const copied = await rm(target, { recursive: true, force: true })
    .then(() => cp(join(scratch, skillsRepoFolder, name), target, { recursive: true }))
    .then(
      () => true,
      () => false,
    );

  const skillFile = copied ? await stat(join(target, 'SKILL.md')).catch(() => null) : null;

  return skillFile?.isFile() === true;
}

// The copy removes the skill's folder first, so a link in the skills path would point that removal
// outside the workspace. The check runs after git, so a link made while git ran is still seen.
async function probeSkillsFolderInWorkspace(workspace: string): Promise<boolean> {
  const parts = workspaceSkillsFolder.split('/');

  const infos = await Promise.all(
    parts.map((_, index) => lstat(join(workspace, ...parts.slice(0, index + 1))).catch(() => null)),
  );

  if (infos.some((info) => info?.isSymbolicLink() === true)) {
    return false;
  }

  const skillsFolder = join(workspace, workspaceSkillsFolder);

  try {
    await mkdir(skillsFolder, { recursive: true });

    const [resolved, resolvedWorkspace] = await Promise.all([
      realpath(skillsFolder),
      realpath(workspace),
    ]);

    return resolved === join(resolvedWorkspace, workspaceSkillsFolder);
  } catch {
    return false;
  }
}
