import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runGit } from '../run-git.ts';
import type { SkillsRepo } from '../test-utils/create-skills-repo.ts';
import { createSkillsRepo } from '../test-utils/create-skills-repo.ts';
import { installSkills } from './install-skills.ts';

async function setupTest() {
  const folder = await mkdtemp(join(tmpdir(), 'boxxy-test-install-skills-'));

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  const workspace = join(folder, 'workspace');

  await mkdir(workspace);

  const install = (repo: SkillsRepo, names: readonly string[], cwd = workspace) =>
    installSkills({
      pin: { source: repo.source, ref: repo.ref },
      names,
      workspace: cwd,
      baseURL: repo.baseURL,
      runGit,
    });

  const runWorkspaceGit = async (args: readonly string[]) => {
    const done = await runGit(args, workspace);

    if (done.exitCode !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${done.output}`);
    }

    return done.output;
  };

  // makes the workspace a repository whose one commit holds these files, by path from its top
  const commitFiles = async (files: Record<string, string>) => {
    for (const [file, text] of Object.entries(files)) {
      await mkdir(dirname(join(workspace, file)), { recursive: true });
      await writeFile(join(workspace, file), text);
    }

    await runWorkspaceGit(['init', '--quiet']);
    await runWorkspaceGit(['add', '--all']);

    await runWorkspaceGit([
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
    ]);
  };

  return {
    install,
    workspace,
    folder,
    commitFiles,
    readStatus: () => runWorkspaceGit(['status', '--porcelain', '--untracked-files=all']),
    readExclude: () => readFile(join(workspace, '.git/info/exclude'), 'utf8'),
    makeRepo: (skills: Record<string, Record<string, string>>) =>
      createSkillsRepo({ folder: join(folder, 'remote'), skills }),
  };
}

test('it leaves a skill the repository commits as committed, extra files included', async () => {
  const ctx = await setupTest();

  await ctx.commitFiles({
    '.claude/skills/docs-writing/SKILL.md': 'committed\n',
    '.claude/skills/docs-writing/scripts/check-links.sh': 'echo links\n',
  });

  const repo = await ctx.makeRepo({ 'docs-writing': { 'SKILL.md': 'pinned\n' } });
  const missing = await ctx.install(repo, ['docs-writing']);
  const status = await ctx.readStatus();
  const skill = await readFile(join(ctx.workspace, '.claude/skills/docs-writing/SKILL.md'), 'utf8');

  expect(missing).toStrictEqual([]);
  expect(status).toBe('');
  expect(skill).toBe('committed\n');
});

test('it returns a skill the repository commits without a SKILL.md as missing', async () => {
  const ctx = await setupTest();

  await ctx.commitFiles({ '.claude/skills/docs-writing/notes.md': 'notes\n' });

  const repo = await ctx.makeRepo({ 'docs-writing': { 'SKILL.md': 'pinned\n' } });
  const missing = await ctx.install(repo, ['docs-writing']);

  expect(missing).toStrictEqual(['docs-writing']);
});

test('it lists each skill it copies in info/exclude, so git status shows no new folder', async () => {
  const ctx = await setupTest();

  await ctx.commitFiles({
    'README.md': 'readme\n',
    '.claude/skills/docs-writing/SKILL.md': 'committed\n',
  });

  const repo = await ctx.makeRepo({
    alpha: { 'SKILL.md': 'alpha\n', 'references/more.md': 'more\n' },
    beta: { 'SKILL.md': 'beta\n' },
    'docs-writing': { 'SKILL.md': 'pinned\n' },
  });

  const missing = await ctx.install(repo, ['alpha', 'beta', 'docs-writing']);
  const status = await ctx.readStatus();
  const exclude = await ctx.readExclude();
  const alpha = await readFile(join(ctx.workspace, '.claude/skills/alpha/SKILL.md'), 'utf8');

  expect(missing).toStrictEqual([]);
  expect(status).toBe('');
  expect(exclude).toEndWith('\n/.claude/skills/alpha/\n/.claude/skills/beta/\n');
  expect(alpha).toBe('alpha\n');
});

test('it lists a copied skill once when a later session installs it again', async () => {
  const ctx = await setupTest();

  await ctx.commitFiles({ 'README.md': 'readme\n' });

  const repo = await ctx.makeRepo({ alpha: { 'SKILL.md': 'alpha\n' } });

  await ctx.install(repo, ['alpha']);
  await ctx.install(repo, ['alpha']);

  const exclude = await ctx.readExclude();

  const lines = exclude.split('\n').filter((line) => line === '/.claude/skills/alpha/');

  expect(lines).toHaveLength(1);
});

test('it lists a copied skill by its path from the top when the workspace is a subfolder', async () => {
  const ctx = await setupTest();

  await ctx.commitFiles({ 'app/README.md': 'readme\n' });

  const repo = await ctx.makeRepo({ alpha: { 'SKILL.md': 'alpha\n' } });

  await ctx.install(repo, ['alpha'], join(ctx.workspace, 'app'));

  const status = await ctx.readStatus();
  const exclude = await ctx.readExclude();

  expect(status).toBe('');
  expect(exclude).toEndWith('\n/app/.claude/skills/alpha/\n');
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
    join(ctx.workspace, '.claude/skills/alpha/references/more.md'),
    'utf8',
  );

  expect(more).toBe('more\n');
});

test('it returns the name of a skill that the repository lacks and installs the others', async () => {
  const ctx = await setupTest();
  const repo = await ctx.makeRepo({ alpha: { 'SKILL.md': 'alpha\n' } });
  const missing = await ctx.install(repo, ['alpha', 'beta']);

  expect(missing).toStrictEqual(['beta']);

  const installed = await readFile(join(ctx.workspace, '.claude/skills/alpha/SKILL.md'), 'utf8');

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

  const old = join(ctx.workspace, '.claude/skills/alpha');

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

test('it returns the name as missing when .claude/skills becomes a symbolic link during the fetch', async () => {
  const ctx = await setupTest();
  const repo = await ctx.makeRepo({ alpha: { 'SKILL.md': 'pinned\n' } });

  const outside = join(ctx.folder, 'outside');
  const skills = join(ctx.workspace, '.claude/skills');

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

test('it returns the name as missing when .claude is a file', async () => {
  const ctx = await setupTest();
  const repo = await ctx.makeRepo({ alpha: { 'SKILL.md': 'pinned\n' } });

  await mkdir(ctx.workspace, { recursive: true });
  await writeFile(join(ctx.workspace, '.claude'), 'a file\n');

  const missing = await ctx.install(repo, ['alpha']);

  expect(missing).toStrictEqual(['alpha']);
});

test('it replaces a skill folder that is a symbolic link and leaves its target untouched', async () => {
  const ctx = await setupTest();
  const repo = await ctx.makeRepo({ alpha: { 'SKILL.md': 'pinned\n' } });

  const outside = join(ctx.folder, 'outside');
  const link = join(ctx.workspace, '.claude/skills/alpha');

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
  ['.claude/skills', '../../outside'],
  ['.claude', '../outside'],
])(
  'it returns the name as missing and leaves the target untouched when %s is a symbolic link',
  async (linkPath, linkTarget) => {
    const ctx = await setupTest();
    const repo = await ctx.makeRepo({ alpha: { 'SKILL.md': 'pinned\n' } });

    const outside = join(ctx.folder, 'outside');
    const link = join(ctx.workspace, linkPath);

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
