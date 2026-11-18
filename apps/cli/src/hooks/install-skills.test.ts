import { expect, onTestFinished, test } from 'bun:test';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runGit } from '../run-git.ts';
import { createGitRepo } from '../test-utils/create-git-repo.ts';
import type { SkillsRepo } from '../test-utils/create-skills-repo.ts';
import { createSkillsRepo } from '../test-utils/create-skills-repo.ts';
import { installSkills } from './install-skills.ts';

async function setupTest() {
  const folder = await mkdtemp(join(tmpdir(), 'boxxy-test-install-skills-'));

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  const workspace = join(folder, 'workspace');

  // most zgeoff repositories commit this folder
  await mkdir(join(workspace, '.agents/skills'), { recursive: true });

  const install = (repo: SkillsRepo, names: readonly string[], cwd = workspace) =>
    installSkills({
      pin: { source: repo.source, ref: repo.ref },
      names,
      workspace: cwd,
      baseURL: repo.baseURL,
      runGit,
    });

  return {
    install,
    workspace,
    folder,
    makeRepo: (skills: Record<string, Record<string, string>>) =>
      createSkillsRepo({ folder: join(folder, 'remote'), skills }),
  };
}

test('it leaves a skill the repository commits as committed, extra files included', async () => {
  const ctx = await setupTest();

  await createGitRepo({
    folder: ctx.workspace,
    files: {
      '.agents/skills/docs-writing/SKILL.md': 'committed\n',
      '.agents/skills/docs-writing/scripts/check-links.sh': 'echo links\n',
    },
  });

  const repo = await ctx.makeRepo({ 'docs-writing': { 'SKILL.md': 'pinned\n' } });
  const missing = await ctx.install(repo, ['docs-writing']);
  const status = await runGit(['status', '--porcelain', '--untracked-files=all'], ctx.workspace);
  const skill = await readFile(join(ctx.workspace, '.agents/skills/docs-writing/SKILL.md'), 'utf8');

  expect(missing).toStrictEqual([]);
  expect(status).toStrictEqual({ exitCode: 0, output: '' });
  expect(skill).toBe('committed\n');
});

test('it installs beside a committed skill in a repository that links .claude/skills to .agents/skills', async () => {
  const ctx = await setupTest();

  await createGitRepo({
    folder: ctx.workspace,
    files: {
      '.agents/skills/docs-writing/SKILL.md': 'committed\n',
      '.agents/skills/docs-writing/scripts/check-links.sh': 'echo links\n',
    },
    links: { '.claude/skills': '../.agents/skills' },
  });

  const repo = await ctx.makeRepo({
    alpha: { 'SKILL.md': 'alpha\n', 'references/more.md': 'more\n' },
    'docs-writing': { 'SKILL.md': 'pinned\n' },
  });

  const missing = await ctx.install(repo, ['alpha', 'docs-writing']);
  const status = await runGit(['status', '--porcelain', '--untracked-files=all'], ctx.workspace);
  const exclude = await readFile(join(ctx.workspace, '.git/info/exclude'), 'utf8');

  const throughLink = await Promise.all(
    ['alpha/SKILL.md', 'alpha/references/more.md', 'docs-writing/SKILL.md'].map((file) =>
      readFile(join(ctx.workspace, '.claude/skills', file), 'utf8'),
    ),
  );

  expect(missing).toStrictEqual([]);
  expect(status).toStrictEqual({ exitCode: 0, output: '' });
  expect(exclude).toEndWith('\n/.agents/skills/alpha/\n');
  expect(throughLink).toStrictEqual(['alpha\n', 'more\n', 'committed\n']);
});

test('it returns a skill the repository commits without a SKILL.md as missing', async () => {
  const ctx = await setupTest();

  await createGitRepo({
    folder: ctx.workspace,
    files: { '.agents/skills/docs-writing/notes.md': 'notes\n' },
  });

  const repo = await ctx.makeRepo({ 'docs-writing': { 'SKILL.md': 'pinned\n' } });
  const missing = await ctx.install(repo, ['docs-writing']);

  expect(missing).toStrictEqual(['docs-writing']);
});

test('it returns a skill as missing and leaves its committed files when git cannot read the repository', async () => {
  const ctx = await setupTest();

  await createGitRepo({
    folder: ctx.workspace,
    files: { '.agents/skills/docs-writing/scripts/check-links.sh': 'echo links\n' },
  });

  await writeFile(join(ctx.workspace, '.git/index'), 'not an index\n');

  const repo = await ctx.makeRepo({ 'docs-writing': { 'SKILL.md': 'pinned\n' } });
  const missing = await ctx.install(repo, ['docs-writing']);

  const script = join(ctx.workspace, '.agents/skills/docs-writing/scripts/check-links.sh');

  const kept = await Bun.file(script).exists();

  expect(missing).toStrictEqual(['docs-writing']);
  expect(kept).toBe(true);
});

test('it lists each skill it copies in info/exclude, so git status shows no new folder', async () => {
  const ctx = await setupTest();

  await createGitRepo({
    folder: ctx.workspace,
    files: { 'README.md': 'readme\n', '.agents/skills/docs-writing/SKILL.md': 'committed\n' },
  });

  const repo = await ctx.makeRepo({
    alpha: { 'SKILL.md': 'alpha\n', 'references/more.md': 'more\n' },
    beta: { 'SKILL.md': 'beta\n' },
    'docs-writing': { 'SKILL.md': 'pinned\n' },
  });

  const missing = await ctx.install(repo, ['alpha', 'beta', 'docs-writing']);
  const status = await runGit(['status', '--porcelain', '--untracked-files=all'], ctx.workspace);
  const exclude = await readFile(join(ctx.workspace, '.git/info/exclude'), 'utf8');
  const alpha = await readFile(join(ctx.workspace, '.agents/skills/alpha/SKILL.md'), 'utf8');

  expect(missing).toStrictEqual([]);
  expect(status).toStrictEqual({ exitCode: 0, output: '' });
  expect(exclude).toEndWith('\n/.agents/skills/alpha/\n/.agents/skills/beta/\n');
  expect(alpha).toBe('alpha\n');
});

test('it copies a skill into a folder the repository ignores and adds no exclude line', async () => {
  const ctx = await setupTest();

  await createGitRepo({ folder: ctx.workspace, files: { '.gitignore': '/runs/\n' } });

  const repo = await ctx.makeRepo({ alpha: { 'SKILL.md': 'alpha\n' } });

  const exclude = join(ctx.workspace, '.git/info/exclude');

  const before = await readFile(exclude, 'utf8');

  await mkdir(join(ctx.workspace, 'runs/one/.agents/skills'), { recursive: true });

  const missing = await ctx.install(repo, ['alpha'], join(ctx.workspace, 'runs/one'));
  const after = await readFile(exclude, 'utf8');
  const status = await runGit(['status', '--porcelain', '--untracked-files=all'], ctx.workspace);

  expect(missing).toStrictEqual([]);
  expect(after).toBe(before);
  expect(status).toStrictEqual({ exitCode: 0, output: '' });
});

test('it creates .agents/skills in a repository with no .agents folder and installs each skill', async () => {
  const ctx = await setupTest();

  await rm(join(ctx.workspace, '.agents'), { recursive: true });

  await createGitRepo({
    folder: ctx.workspace,
    files: { 'skills/docs-writing/SKILL.md': 'source\n' },
    links: { '.claude/skills': '../skills' },
  });

  const repo = await ctx.makeRepo({
    alpha: { 'SKILL.md': 'alpha\n' },
    beta: { 'SKILL.md': 'beta\n' },
  });

  const missing = await ctx.install(repo, ['alpha', 'beta']);

  expect(missing).toStrictEqual([]);

  const status = await runGit(['status', '--porcelain', '--untracked-files=all'], ctx.workspace);

  const installed = await Promise.all(
    ['alpha', 'beta'].map((name) =>
      readFile(join(ctx.workspace, '.agents/skills', name, 'SKILL.md'), 'utf8'),
    ),
  );

  expect(status).toStrictEqual({ exitCode: 0, output: '' });
  expect(installed).toStrictEqual(['alpha\n', 'beta\n']);
});

test('it returns every name and creates nothing when the workspace is missing', async () => {
  const ctx = await setupTest();

  await rm(join(ctx.workspace, '.agents'), { recursive: true });
  await createGitRepo({ folder: ctx.workspace, files: { 'README.md': 'readme\n' } });

  const repo = await ctx.makeRepo({
    alpha: { 'SKILL.md': 'alpha\n' },
    beta: { 'SKILL.md': 'beta\n' },
  });

  const missing = await ctx.install(repo, ['alpha', 'beta'], join(ctx.workspace, 'app'));
  const status = await runGit(['status', '--porcelain', '--untracked-files=all'], ctx.workspace);
  const workspaceEntries = await readdir(ctx.workspace);
  const gitFiles = await readdir(join(ctx.workspace, '.git/info'));
  const exclude = await readFile(join(ctx.workspace, '.git/info/exclude'), 'utf8');

  expect(missing).toStrictEqual(['alpha', 'beta']);
  expect(status).toStrictEqual({ exitCode: 0, output: '' });
  expect(workspaceEntries.toSorted()).toStrictEqual(['.git', 'README.md']);
  expect(gitFiles).toStrictEqual(['exclude']);
  expect(exclude).not.toInclude('.agents');
});

test('it keeps the exclude line of a copy in one worktree when another worktree commits the skill', async () => {
  const ctx = await setupTest();

  await createGitRepo({
    folder: ctx.workspace,
    files: { '.agents/skills/kept/SKILL.md': 'kept\n' },
  });

  const other = join(ctx.folder, 'other');

  await runGit(['worktree', 'add', '--quiet', '-b', 'other', other], ctx.workspace);
  await mkdir(join(other, '.agents/skills/alpha'), { recursive: true });
  await writeFile(join(other, '.agents/skills/alpha/SKILL.md'), 'committed\n');
  await runGit(['add', '.agents/skills/alpha'], other);

  await runGit(
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
      'alpha',
    ],
    other,
  );

  const repo = await ctx.makeRepo({ alpha: { 'SKILL.md': 'pinned\n' } });

  await ctx.install(repo, ['alpha']);
  await ctx.install(repo, ['alpha'], other);

  const statuses = await Promise.all(
    [ctx.workspace, other].map((folder) =>
      runGit(['status', '--porcelain', '--untracked-files=all'], folder),
    ),
  );

  expect(statuses).toStrictEqual([
    { exitCode: 0, output: '' },
    { exitCode: 0, output: '' },
  ]);
});

test.each(['info/exclude', 'info/exclude.boxxy-lock'])(
  'it returns a skill as missing and leaves the target untouched when %s is a symbolic link',
  async (file) => {
    const ctx = await setupTest();

    await createGitRepo({ folder: ctx.workspace, files: { 'README.md': 'readme\n' } });

    const outside = join(ctx.folder, 'outside.txt');
    const path = join(ctx.workspace, '.git', file);

    await writeFile(outside, 'keep\n');
    await rm(path, { force: true });
    await symlink(outside, path);

    const repo = await ctx.makeRepo({ alpha: { 'SKILL.md': 'alpha\n' } });
    const missing = await ctx.install(repo, ['alpha']);
    const kept = await readFile(outside, 'utf8');

    expect([missing, kept]).toStrictEqual([['alpha'], 'keep\n']);
  },
);

test('it returns a skill it cannot exclude as missing and copies nothing', async () => {
  const ctx = await setupTest();

  await createGitRepo({ folder: ctx.workspace, files: { 'README.md': 'readme\n' } });
  await rm(join(ctx.workspace, '.git/info'), { recursive: true, force: true });
  await writeFile(join(ctx.workspace, '.git/info'), 'a file\n');

  const repo = await ctx.makeRepo({ alpha: { 'SKILL.md': 'alpha\n' } });
  const missing = await ctx.install(repo, ['alpha']);
  const copied = await Bun.file(join(ctx.workspace, '.agents/skills/alpha/SKILL.md')).exists();

  expect(missing).toStrictEqual(['alpha']);
  expect(copied).toBe(false);
});

test('it lists a copied skill by its escaped path from the top when the workspace is a subfolder', async () => {
  const ctx = await setupTest();

  await createGitRepo({ folder: ctx.workspace, files: { 'a b[1]/README.md': 'readme\n' } });
  await mkdir(join(ctx.workspace, 'a b[1]/.agents/skills'), { recursive: true });

  const repo = await ctx.makeRepo({ alpha: { 'SKILL.md': 'alpha\n' } });

  await ctx.install(repo, ['alpha'], join(ctx.workspace, 'a b[1]'));

  const status = await runGit(['status', '--porcelain', '--untracked-files=all'], ctx.workspace);
  const exclude = await readFile(join(ctx.workspace, '.git/info/exclude'), 'utf8');

  expect(status).toStrictEqual({ exitCode: 0, output: '' });
  expect(exclude).toEndWith(`${String.raw`/a b\[1]/.agents/skills/alpha/`}\n`);
});

test('it copies each listed skill with all its files and returns no missing name', async () => {
  const ctx = await setupTest();

  const repo = await ctx.makeRepo({
    alpha: { 'SKILL.md': 'alpha\n', 'references/more.md': 'more\n' },
    beta: { 'SKILL.md': 'beta\n' },
  });

  const missing = await ctx.install(repo, ['alpha', 'beta']);

  expect(missing).toStrictEqual([]);

  const more = await readFile(
    join(ctx.workspace, '.agents/skills/alpha/references/more.md'),
    'utf8',
  );

  expect(more).toBe('more\n');
});

test('it returns the name of a skill that the repository lacks and installs the others', async () => {
  const ctx = await setupTest();
  const repo = await ctx.makeRepo({ alpha: { 'SKILL.md': 'alpha\n' } });
  const missing = await ctx.install(repo, ['alpha', 'beta']);

  expect(missing).toStrictEqual(['beta']);

  const installed = await readFile(join(ctx.workspace, '.agents/skills/alpha/SKILL.md'), 'utf8');

  expect(installed).toBe('alpha\n');
});

test('it returns the name of a skill whose folder has no SKILL.md', async () => {
  const ctx = await setupTest();
  const repo = await ctx.makeRepo({ alpha: { 'notes.md': 'no skill file\n' } });
  const missing = await ctx.install(repo, ['alpha']);

  expect(missing).toStrictEqual(['alpha']);
});

test('it replaces a skill that an earlier session left in the workspace', async () => {
  const ctx = await setupTest();
  const repo = await ctx.makeRepo({ alpha: { 'SKILL.md': 'new\n' } });

  const old = join(ctx.workspace, '.agents/skills/alpha');

  await mkdir(old, { recursive: true });
  await writeFile(join(old, 'SKILL.md'), 'old\n');
  await writeFile(join(old, 'stale.md'), 'stale\n');

  await ctx.install(repo, ['alpha']);

  const staleKept = await Bun.file(join(old, 'stale.md')).exists();
  const current = await readFile(join(old, 'SKILL.md'), 'utf8');

  expect(staleKept).toBe(false);
  expect(current).toBe('new\n');
});

test('it returns every name when the repository cannot be fetched', async () => {
  const ctx = await setupTest();
  const repo = await ctx.makeRepo({ alpha: { 'SKILL.md': 'alpha\n' } });

  const missing = await ctx.install({ ...repo, baseURL: join(ctx.folder, 'nowhere') }, [
    'alpha',
    'beta',
  ]);

  expect(missing).toStrictEqual(['alpha', 'beta']);
});

test('it returns every name when the pin names a commit the repository lacks', async () => {
  const ctx = await setupTest();
  const repo = await ctx.makeRepo({ alpha: { 'SKILL.md': 'alpha\n' } });
  const missing = await ctx.install({ ...repo, ref: 'a'.repeat(40) }, ['alpha']);

  expect(missing).toStrictEqual(['alpha']);
});

test('it returns every name when the rules have no pin', async () => {
  const ctx = await setupTest();

  const missing = await installSkills({
    pin: null,
    names: ['alpha'],
    workspace: ctx.workspace,
    baseURL: ctx.folder,
    runGit,
  });

  expect(missing).toStrictEqual(['alpha']);
});

test.each(['../outside', 'a/b', '.hidden', '-flag', ''])(
  'it returns the name %p as missing and writes nothing outside the skills folder',
  async (name) => {
    const ctx = await setupTest();
    const repo = await ctx.makeRepo({ alpha: { 'SKILL.md': 'alpha\n' } });
    const missing = await ctx.install(repo, [name]);
    const escaped = await Bun.file(join(ctx.workspace, 'outside/SKILL.md')).exists();

    expect([missing, escaped]).toStrictEqual([[name], false]);
  },
);

test('it returns a pin whose repository name is not owner/name as missing', async () => {
  const ctx = await setupTest();

  const missing = await installSkills({
    pin: { source: '../escape', ref: 'a'.repeat(40) },
    names: ['alpha'],
    workspace: ctx.workspace,
    baseURL: ctx.folder,
    runGit,
  });

  expect(missing).toStrictEqual(['alpha']);
});

test('it returns no name and starts no git when the recipe lists no skill', async () => {
  const ctx = await setupTest();

  const calls: string[][] = [];

  const missing = await installSkills({
    pin: null,
    names: [],
    workspace: ctx.workspace,
    baseURL: ctx.folder,
    runGit: (args) => {
      calls.push([...args]);

      return Promise.resolve({ exitCode: 0, output: '' });
    },
  });

  expect([missing, calls]).toStrictEqual([[], []]);
});

test('it returns the name as missing when .agents/skills becomes a symbolic link during the fetch', async () => {
  const ctx = await setupTest();
  const repo = await ctx.makeRepo({ alpha: { 'SKILL.md': 'pinned\n' } });

  const outside = join(ctx.folder, 'outside');
  const skills = join(ctx.workspace, '.agents/skills');

  await mkdir(skills, { recursive: true });
  await mkdir(join(outside, 'alpha'), { recursive: true });
  await writeFile(join(outside, 'alpha/keep.txt'), 'keep\n');

  const missing = await installSkills({
    pin: { source: repo.source, ref: repo.ref },
    names: ['alpha'],
    workspace: ctx.workspace,
    baseURL: repo.baseURL,
    runGit: async (args, folder) => {
      const result = await runGit(args, folder);

      if (args[0] === 'checkout') {
        await rename(skills, join(ctx.folder, 'skills-moved'));
        await symlink(outside, skills);
      }

      return result;
    },
  });

  const outsideFiles = await Array.fromAsync(new Bun.Glob('**/*').scan({ cwd: outside }));

  expect([missing, outsideFiles]).toStrictEqual([['alpha'], ['alpha/keep.txt']]);
});

test.each(['.agents', '.agents/skills'])(
  'it returns the name as missing and replaces nothing when %s is a file',
  async (file) => {
    const ctx = await setupTest();
    const repo = await ctx.makeRepo({ alpha: { 'SKILL.md': 'pinned\n' } });

    await rm(join(ctx.workspace, '.agents'), { recursive: true });
    await mkdir(dirname(join(ctx.workspace, file)), { recursive: true });
    await writeFile(join(ctx.workspace, file), 'a file\n');

    const missing = await ctx.install(repo, ['alpha']);
    const kept = await readFile(join(ctx.workspace, file), 'utf8');

    expect(missing).toStrictEqual(['alpha']);
    expect(kept).toBe('a file\n');
  },
);

test('it replaces a skill folder that is a symbolic link and leaves its target untouched', async () => {
  const ctx = await setupTest();
  const repo = await ctx.makeRepo({ alpha: { 'SKILL.md': 'pinned\n' } });

  const outside = join(ctx.folder, 'outside');
  const link = join(ctx.workspace, '.agents/skills/alpha');

  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, 'keep.txt'), 'keep\n');
  await mkdir(dirname(link), { recursive: true });
  await symlink('../../../outside', link);

  const missing = await ctx.install(repo, ['alpha']);
  const outsideFiles = await Array.fromAsync(new Bun.Glob('**/*').scan({ cwd: outside }));
  const installed = await readFile(join(link, 'SKILL.md'), 'utf8');

  expect([missing, outsideFiles, installed]).toStrictEqual([[], ['keep.txt'], 'pinned\n']);
});

test.each([
  ['.agents/skills', '../../outside'],
  ['.agents', '../outside'],
])(
  'it returns the name as missing and leaves the target untouched when %s is a symbolic link',
  async (linkPath, linkTarget) => {
    const ctx = await setupTest();
    const repo = await ctx.makeRepo({ alpha: { 'SKILL.md': 'pinned\n' } });

    const outside = join(ctx.folder, 'outside');
    const link = join(ctx.workspace, linkPath);

    await rm(join(ctx.workspace, '.agents'), { recursive: true });
    await mkdir(join(outside, 'alpha'), { recursive: true });
    await mkdir(join(outside, 'skills/alpha'), { recursive: true });
    await writeFile(join(outside, 'alpha/keep.txt'), 'keep\n');
    await writeFile(join(outside, 'skills/alpha/keep.txt'), 'keep\n');
    await mkdir(dirname(link), { recursive: true });
    await symlink(linkTarget, link);

    const missing = await ctx.install(repo, ['alpha']);
    const outsideFiles = await Array.fromAsync(new Bun.Glob('**/*').scan({ cwd: outside }));

    expect([missing, outsideFiles.toSorted()]).toStrictEqual([
      ['alpha'],
      ['alpha/keep.txt', 'skills/alpha/keep.txt'],
    ]);
  },
);

test('it returns the name as missing and makes no folder in the target when .agents links to an empty folder', async () => {
  const ctx = await setupTest();
  const repo = await ctx.makeRepo({ alpha: { 'SKILL.md': 'pinned\n' } });

  const outside = join(ctx.folder, 'outside');

  await rm(join(ctx.workspace, '.agents'), { recursive: true });
  await mkdir(outside);
  await symlink('../outside', join(ctx.workspace, '.agents'));

  const missing = await ctx.install(repo, ['alpha']);

  expect(missing).toStrictEqual(['alpha']);

  const outsideEntries = await readdir(outside);

  expect(outsideEntries).toStrictEqual([]);
});
