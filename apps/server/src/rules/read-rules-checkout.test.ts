import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { $ } from 'bun';
import { readRulesCheckout } from './read-rules-checkout.ts';

async function setupTest() {
  const folder = await mkdtemp(path.join(tmpdir(), 'boxxy-test-rules-'));

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  return {
    folder,
    writeFile: (name: string, text: string) => Bun.write(path.join(folder, name), text),
    linkFile: (name: string, target: string) => symlink(target, path.join(folder, name)),
    runGit: (args: readonly string[]) =>
      $`git -C ${folder} -c user.name=test -c user.email=test@example.com ${args}`.quiet(),
    decode: (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes),
  };
}

test('it reads a plain folder as the folder commit, with each file that is not hidden', async () => {
  const ctx = await setupTest();

  await ctx.writeFile('rules.yaml', 'version: 1\n');
  await ctx.writeFile('prompts/build-v1.md', 'Build it.\n');
  await ctx.writeFile('.hidden', 'not read\n');

  const answer = await readRulesCheckout({ folder: ctx.folder, ref: 'origin/main' });

  expect(
    answer.kind === 'read' && [answer.checkout.commit, [...answer.checkout.files.keys()]],
  ).toStrictEqual(['folder', ['prompts/build-v1.md', 'rules.yaml']]);
});

test('it reads a git checkout at its commit when the commit is on the rules ref', async () => {
  const ctx = await setupTest();

  await ctx.writeFile('rules.yaml', 'version: 1\n');
  await ctx.runGit(['init', '-q']);
  await ctx.runGit(['add', '.']);
  await ctx.runGit(['commit', '-q', '-m', 'add the rules']);
  await ctx.runGit(['update-ref', 'refs/remotes/origin/main', 'HEAD']);

  const head = await ctx.runGit(['rev-parse', 'HEAD']);
  const answer = await readRulesCheckout({ folder: ctx.folder, ref: 'origin/main' });

  expect(
    answer.kind === 'read' && [
      answer.checkout.commit,
      ctx.decode(answer.checkout.files.get('rules.yaml')),
    ],
  ).toStrictEqual([head.text().trim(), 'version: 1\n']);
});

test('it refuses a git checkout whose commit is not on the rules ref', async () => {
  const ctx = await setupTest();

  await ctx.writeFile('rules.yaml', 'version: 1\n');
  await ctx.runGit(['init', '-q']);
  await ctx.runGit(['add', '.']);
  await ctx.runGit(['commit', '-q', '-m', 'add the rules']);
  await ctx.runGit(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  await ctx.writeFile('rules.yaml', 'version: 2\n');
  await ctx.runGit(['commit', '-q', '-a', '-m', 'change the rules on a branch']);

  const answer = await readRulesCheckout({ folder: ctx.folder, ref: 'origin/main' });

  expect(answer).toStrictEqual({
    kind: 'rejected',
    reason: 'the rules checkout is at a commit that origin/main does not hold',
  });
});

test('it refuses a git checkout that has no rules ref', async () => {
  const ctx = await setupTest();

  await ctx.writeFile('rules.yaml', 'version: 1\n');
  await ctx.runGit(['init', '-q']);
  await ctx.runGit(['add', '.']);
  await ctx.runGit(['commit', '-q', '-m', 'add the rules']);

  const answer = await readRulesCheckout({ folder: ctx.folder, ref: 'origin/main' });

  expect(answer).toStrictEqual({
    kind: 'rejected',
    reason: 'git could not read the rules ref origin/main',
  });
});

test('it reads the files of the checked commit when the working tree holds other bytes', async () => {
  const ctx = await setupTest();

  await ctx.writeFile('rules.yaml', 'version: 1\n');
  await ctx.runGit(['init', '-q']);
  await ctx.runGit(['add', '.']);
  await ctx.runGit(['commit', '-q', '-m', 'add the rules']);
  await ctx.runGit(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  await ctx.runGit(['update-index', '--assume-unchanged', 'rules.yaml']);
  await ctx.writeFile('rules.yaml', 'version: 2\n');

  const answer = await readRulesCheckout({ folder: ctx.folder, ref: 'origin/main' });

  expect(answer.kind === 'read' && ctx.decode(answer.checkout.files.get('rules.yaml'))).toBe(
    'version: 1\n',
  );
});

test('it reads the committed bytes when a replace object stands in for the rules blob', async () => {
  const ctx = await setupTest();

  await ctx.writeFile('rules.yaml', 'version: 1\n');
  await ctx.runGit(['init', '-q']);
  await ctx.runGit(['add', '.']);
  await ctx.runGit(['commit', '-q', '-m', 'add the rules']);
  await ctx.runGit(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  await ctx.writeFile('unreviewed.yaml', 'version: 2\n');

  const reviewed = await ctx.runGit(['rev-parse', 'HEAD:rules.yaml']);
  const unreviewed = await ctx.runGit(['hash-object', '-w', 'unreviewed.yaml']);

  await ctx.runGit(['replace', reviewed.text().trim(), unreviewed.text().trim()]);

  await rm(path.join(ctx.folder, 'unreviewed.yaml'));

  const answer = await readRulesCheckout({ folder: ctx.folder, ref: 'origin/main' });

  expect(answer.kind === 'read' && ctx.decode(answer.checkout.files.get('rules.yaml'))).toBe(
    'version: 1\n',
  );
});

test('it refuses a git checkout whose commit holds a symlink', async () => {
  const ctx = await setupTest();

  await ctx.writeFile('real.yaml', 'version: 1\n');
  await ctx.linkFile('rules.yaml', 'real.yaml');
  await ctx.runGit(['init', '-q']);
  await ctx.runGit(['add', '.']);
  await ctx.runGit(['commit', '-q', '-m', 'add the rules']);
  await ctx.runGit(['update-ref', 'refs/remotes/origin/main', 'HEAD']);

  const answer = await readRulesCheckout({ folder: ctx.folder, ref: 'origin/main' });

  expect(answer).toStrictEqual({
    kind: 'rejected',
    reason: 'the rules commit holds rules.yaml, which is not a plain file',
  });
});

test('it refuses a git checkout with uncommitted changes', async () => {
  const ctx = await setupTest();

  await ctx.writeFile('rules.yaml', 'version: 1\n');
  await ctx.runGit(['init', '-q']);
  await ctx.runGit(['add', '.']);
  await ctx.runGit(['commit', '-q', '-m', 'add the rules']);
  await ctx.writeFile('rules.yaml', 'version: 2\n');

  const answer = await readRulesCheckout({ folder: ctx.folder, ref: 'origin/main' });

  expect(answer).toStrictEqual({
    kind: 'rejected',
    reason: 'the rules checkout has uncommitted changes',
  });
});

test('it refuses a folder that does not exist', async () => {
  const ctx = await setupTest();

  const answer = await readRulesCheckout({
    folder: path.join(ctx.folder, 'missing'),
    ref: 'origin/main',
  });

  expect(answer.kind).toBe('rejected');
});
