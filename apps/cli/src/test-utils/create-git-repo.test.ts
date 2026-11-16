import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGit } from '../run-git.ts';
import { createGitRepo } from './create-git-repo.ts';

async function setupTest() {
  const folder = await mkdtemp(join(tmpdir(), 'boxxy-test-git-repo-'));

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  return { repo: join(folder, 'repo') };
}

test('it commits each file and returns the commit', async () => {
  const ctx = await setupTest();

  const commit = await createGitRepo({
    folder: ctx.repo,
    files: { 'README.md': 'readme\n', 'docs/a.md': 'a\n' },
  });

  const tracked = await runGit(['ls-tree', '-r', '--name-only', commit], ctx.repo);
  const status = await runGit(['status', '--porcelain'], ctx.repo);

  expect(tracked.output).toBe('README.md\ndocs/a.md\n');
  expect(status.output).toBe('');
});
