import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGit } from '../run-git.ts';
import { createSkillsRepo } from './create-skills-repo.ts';

async function setupTest() {
  const folder = await mkdtemp(join(tmpdir(), 'boxxy-test-skills-'));

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  return { folder };
}

test('it makes a repository whose commit another repository fetches by ID', async () => {
  const ctx = await setupTest();

  const repo = await createSkillsRepo({
    folder: ctx.folder,
    skills: { demo: { 'SKILL.md': 'x' } },
  });

  const mine = await mkdtemp(join(tmpdir(), 'boxxy-test-fetch-'));

  onTestFinished(() => rm(mine, { recursive: true, force: true }));

  await runGit(['init', '--quiet'], mine);

  const fetched = await runGit(
    ['fetch', '--quiet', '--depth', '1', `${repo.baseURL}/${repo.source}.git`, repo.ref],
    mine,
  );

  expect(fetched.exitCode).toBe(0);
});

test('it gives a full commit ID', async () => {
  const ctx = await setupTest();

  const repo = await createSkillsRepo({
    folder: ctx.folder,
    skills: { demo: { 'SKILL.md': 'x' } },
  });

  expect(repo.ref).toMatch(/^[0-9a-f]{40}$/u);
});
