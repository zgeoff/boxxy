import { cp, lstat, mkdir, mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
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

  const skillsFolder = await resolveSkillsFolder(input.workspace);

  if (skillsFolder === null) {
    return false;
  }

  const target = join(skillsFolder, name);

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

// The copy removes the skill's folder first, so a link in the skills path that leaves the workspace
// would point that removal outside it. The check runs after git, so a link made while git ran is
// still seen. Returns the real path of the skills folder, or null when it is outside the workspace.
async function resolveSkillsFolder(workspace: string): Promise<string | null> {
  const skillsFolder = join(workspace, workspaceSkillsFolder);

  try {
    const existing = await realpath(skillsFolder).catch(() => null);

    // mkdir follows a link, so a folder made through one could land outside the workspace
    if (existing === null) {
      const linked = await probeLinkOnSkillsPath(workspace);

      if (linked) {
        return null;
      }
    }

    await mkdir(skillsFolder, { recursive: true });

    const [resolved, resolvedWorkspace] = await Promise.all([
      realpath(skillsFolder),
      realpath(workspace),
    ]);

    return isInsideFolder(resolved, resolvedWorkspace) ? resolved : null;
  } catch {
    return null;
  }
}

async function probeLinkOnSkillsPath(workspace: string): Promise<boolean> {
  const parts = workspaceSkillsFolder.split('/');

  const infos = await Promise.all(
    parts.map((_, index) => lstat(join(workspace, ...parts.slice(0, index + 1))).catch(() => null)),
  );

  return infos.some((info) => info?.isSymbolicLink() === true);
}

function isInsideFolder(path: string, folder: string): boolean {
  const fromFolder = relative(folder, path);

  return fromFolder !== '' && !fromFolder.startsWith('..') && !isAbsolute(fromFolder);
}
