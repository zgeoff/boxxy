import {
  appendFile,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { skillsRepoFolder, workspaceSkillsFolder } from '../constants.ts';
import type { CLIDeps } from '../types.ts';
import { buildSkillExcludeAddition } from './build-skill-exclude-addition.ts';

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

type SkillOutcome = 'copied' | 'committed' | 'missing';

const sourcePattern = /^[\w.-]+\/[\w.-]+$/u;
const refPattern = /^[0-9a-f]{40,64}$/u;

// A fetch that fails leaves every name missing, because the attempt cannot tell a skill it lacks
// from one it could not read.
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

    const outcomes: { name: string; outcome: SkillOutcome }[] = [];

    for (const name of input.names) {
      outcomes.push({ name, outcome: await installSkill(input, scratch, name) });
    }

    const namesWith = (outcome: SkillOutcome) =>
      outcomes.filter((entry) => entry.outcome === outcome).map((entry) => entry.name);

    await writeSkillExcludes(input, namesWith('copied'));

    return namesWith('missing');
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
): Promise<SkillOutcome> {
  if (!namePattern.test(name)) {
    return 'missing';
  }

  const checkout = await input.runGit(
    ['checkout', '--quiet', 'FETCH_HEAD', '--', `${skillsRepoFolder}/${name}`],
    scratch,
  );

  if (checkout.exitCode !== 0) {
    return 'missing';
  }

  const target = join(input.workspace, workspaceSkillsFolder, name);

  const tracked = await probeSkillTracked(input, name);

  // The repository's checks and docs expect its own copy, and replacing it would show as changed
  // tracked files in the agent's pull request.
  if (tracked) {
    const committed = await probeSkillFile(target);

    return committed ? 'committed' : 'missing';
  }

  const inside = await probeSkillsFolderInWorkspace(input.workspace);

  if (!inside) {
    return 'missing';
  }

  // Node has no openat, so a link made between the check above and this rm or cp still moves them
  const copied = await rm(target, { recursive: true, force: true })
    .then(() => cp(join(scratch, skillsRepoFolder, name), target, { recursive: true }))
    .then(
      () => true,
      () => false,
    );

  const installed = copied ? await probeSkillFile(target) : false;

  return installed ? 'copied' : 'missing';
}

async function probeSkillTracked(input: InstallSkillsInput, name: string): Promise<boolean> {
  const listed = await input.runGit(
    ['ls-files', '--cached', '--', `${workspaceSkillsFolder}/${name}`],
    input.workspace,
  );

  return listed.exitCode === 0 && listed.output.trim() !== '';
}

async function probeSkillFile(folder: string): Promise<boolean> {
  const skillFile = await stat(join(folder, 'SKILL.md')).catch(() => null);

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

// A workspace outside any repository has no status to keep clean, so it gets no exclude.
async function writeSkillExcludes(
  input: InstallSkillsInput,
  names: readonly string[],
): Promise<void> {
  if (names.length === 0) {
    return;
  }

  const paths = await input.runGit(
    ['rev-parse', '--show-prefix', '--git-path', 'info/exclude'],
    input.workspace,
  );

  if (paths.exitCode !== 0) {
    return;
  }

  const [prefix = '', excludePath = ''] = paths.output.split('\n');
  const exclude = isAbsolute(excludePath) ? excludePath : join(input.workspace, excludePath);

  const existing = await readFile(exclude, 'utf8').catch(() => '');

  const addition = buildSkillExcludeAddition({ existing, prefix, names });

  if (addition === '') {
    return;
  }

  await mkdir(dirname(exclude), { recursive: true });
  await appendFile(exclude, addition);
}
