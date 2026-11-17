import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { withFileLock } from '@zgeoff/std/with-file-lock';
import { match } from 'ts-pattern';
import { skillsRepoFolder, workspaceSkillsFolder } from '../constants.ts';
import type { CLIDeps } from '../types.ts';
import { buildSkillExclude } from './build-skill-exclude.ts';

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

  // the folder the agent works in, which must exist; the skills land in its `.agents/skills`
  readonly workspace: string;

  // where `<owner>/<name>.git` is fetched from
  readonly baseURL: string;
  readonly runGit: CLIDeps['runGit'];
}

const sourcePattern = /^[\w.-]+\/[\w.-]+$/u;
const refPattern = /^[0-9a-f]{40,64}$/u;

// `copy` needs an exclude line, and `copy-ignored` is a folder the repository already ignores
type SkillPlan = 'copy' | 'copy-ignored' | 'committed' | 'missing';

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

    // made and checked before any write to git's files, so a workspace that can't hold the copies
    // keeps git's files as they were; each copy checks again, after git has run
    const ready = await createSkillsFolder(input.workspace);

    if (!ready) {
      return [...input.names];
    }

    const repository = await readWorkspaceRepository(input);

    if (repository.kind === 'unreadable') {
      return [...input.names];
    }

    const plans: { name: string; plan: SkillPlan }[] = [];

    for (const name of input.names) {
      plans.push({ name, plan: await readSkillPlan(input, scratch, name, repository) });
    }

    const namesWith = (plan: SkillPlan) =>
      plans.filter((entry) => entry.plan === plan).map((entry) => entry.name);

    const excluded = await writeSkillExclude(repository, namesWith('copy'));

    const unexcluded = excluded ? [] : namesWith('copy');

    const missing = new Set([...namesWith('missing'), ...unexcluded]);

    const copies = [...namesWith('copy-ignored'), ...(excluded ? namesWith('copy') : [])];

    for (const name of copies) {
      const copied = await copySkill(input, scratch, name);

      if (!copied) {
        missing.add(name);
      }
    }

    return input.names.filter((name) => missing.has(name));
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

// A recursive mkdir follows a link in the path, and would make `skills` in the link's target, so the
// walk makes one part at a time and stops at a part that is a link or a file.
async function createSkillsFolder(workspace: string): Promise<boolean> {
  const parts = workspaceSkillsFolder.split('/');

  for (const index of parts.keys()) {
    const path = join(workspace, ...parts.slice(0, index + 1));

    const info = await lstat(path).catch(() => null);

    if (info !== null && !info.isDirectory()) {
      return false;
    }

    if (info !== null) {
      continue;
    }

    const made = await mkdir(path).then(
      () => true,
      () => false,
    );

    if (!made) {
      return false;
    }
  }

  return probeSkillsFolderInWorkspace(workspace);
}

// The copy removes the skill's folder first, so a link in the skills path would point that removal
// outside the workspace. The check runs after git, so a link made while git ran is still seen.
async function probeSkillsFolderInWorkspace(workspace: string): Promise<boolean> {
  const parts = workspaceSkillsFolder.split('/');

  const infos = await Promise.all(
    parts.map((_, index) => lstat(join(workspace, ...parts.slice(0, index + 1))).catch(() => null)),
  );

  if (infos.some((info) => info === null || !info.isDirectory())) {
    return false;
  }

  const skillsFolder = join(workspace, workspaceSkillsFolder);

  try {
    const [resolved, resolvedWorkspace] = await Promise.all([
      realpath(skillsFolder),
      realpath(workspace),
    ]);

    return resolved === join(resolvedWorkspace, workspaceSkillsFolder);
  } catch {
    return false;
  }
}

type WorkspaceRepository =
  | { readonly kind: 'none' }
  | { readonly kind: 'unreadable' }
  | {
      readonly kind: 'found';

      // the workspace's path from the repository's top, ending in `/`, or empty at the top
      readonly prefix: string;
      readonly excludePath: string;
    };

// A repository git can't read, such as one with a corrupt index, still holds files the install
// must not replace, so only a workspace with no `.git` above it counts as outside any repository.
async function readWorkspaceRepository(input: InstallSkillsInput): Promise<WorkspaceRepository> {
  const inside = await probeGitEntryAbove(input.workspace);

  if (!inside) {
    return { kind: 'none' };
  }

  const paths = await input
    .runGit(['rev-parse', '--show-prefix', '--git-path', 'info/exclude'], input.workspace)
    .catch(() => null);

  if (paths === null || paths.exitCode !== 0) {
    return { kind: 'unreadable' };
  }

  const [prefix = '', excludePath = ''] = paths.output.split('\n');

  return {
    kind: 'found',
    prefix,
    excludePath: isAbsolute(excludePath) ? excludePath : join(input.workspace, excludePath),
  };
}

async function probeGitEntryAbove(folder: string): Promise<boolean> {
  const entry = await lstat(join(folder, '.git')).catch(() => null);

  if (entry !== null) {
    return true;
  }

  const parent = dirname(folder);

  return parent === folder ? false : probeGitEntryAbove(parent);
}

const namePattern = /^[a-z0-9][a-z0-9._-]*$/u;

async function readSkillPlan(
  input: InstallSkillsInput,
  scratch: string,
  name: string,
  repository: WorkspaceRepository,
): Promise<SkillPlan> {
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

  if (repository.kind === 'none') {
    return 'copy';
  }

  const listed = await input.runGit(
    ['ls-files', '--cached', '--', `${workspaceSkillsFolder}/${name}`],
    input.workspace,
  );

  if (listed.exitCode !== 0) {
    return 'missing';
  }

  if (listed.output.trim() === '') {
    const ignored = await input.runGit(
      ['check-ignore', '--quiet', '--', `${workspaceSkillsFolder}/${name}/`],
      input.workspace,
    );

    return match(ignored.exitCode)
      .with(0, () => 'copy-ignored' as const)
      .with(1, () => 'copy' as const)
      .otherwise(() => 'missing' as const);
  }

  // The repository's checks and docs expect its own copy, and replacing it would show as changed
  // tracked files in the agent's pull request.
  const committed = await probeSkillFile(join(input.workspace, workspaceSkillsFolder, name));

  return committed ? 'committed' : 'missing';
}

async function probeSkillFile(folder: string): Promise<boolean> {
  const skillFile = await stat(join(folder, 'SKILL.md')).catch(() => null);

  return skillFile?.isFile() === true;
}

const excludeLockWaitMs = 10_000;

// Worktrees of one repository share its exclude file, so two sessions can update it at once, and a
// line stays when one worktree commits the skill: another worktree can still hold an untracked copy.
async function writeSkillExclude(
  repository: WorkspaceRepository,
  add: readonly string[],
): Promise<boolean> {
  if (repository.kind !== 'found' || add.length === 0) {
    return true;
  }

  const lockPath = `${repository.excludePath}.boxxy-lock`;

  try {
    await mkdir(dirname(repository.excludePath), { recursive: true });

    // the lock helper and writeFile follow a link, which would aim the write at another file
    const linked = await Promise.all(
      [repository.excludePath, lockPath].map((path) =>
        lstat(path).then(
          (info) => info.isSymbolicLink(),
          () => false,
        ),
      ),
    );

    if (linked.includes(true)) {
      return false;
    }

    const result = await withFileLock(
      lockPath,
      async () => {
        const existing = await readFile(repository.excludePath, 'utf8').catch(() => '');

        const next = buildSkillExclude({ existing, prefix: repository.prefix, add });

        if (next !== existing) {
          await writeFile(repository.excludePath, next);
        }
      },
      { waitMs: excludeLockWaitMs },
    );

    return result.kind === 'ran';
  } catch {
    return false;
  }
}

async function copySkill(
  input: InstallSkillsInput,
  scratch: string,
  name: string,
): Promise<boolean> {
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

  return copied ? probeSkillFile(target) : false;
}
